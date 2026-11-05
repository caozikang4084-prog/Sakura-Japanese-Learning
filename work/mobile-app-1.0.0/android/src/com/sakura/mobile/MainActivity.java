package com.sakura.mobile;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int AUDIO_PERMISSION_REQUEST = 4101;
    private static final String MAIN_APP_URL =
        "file:///android_asset/www/src/index.html";
    private WebView webView;
    private PermissionRequest pendingPermissionRequest;
    private SpeechCompatibilityBridge speechCompatibility;
    private LearningBackupBridge learningBackup;
    private boolean nativeBridgeAttached;
    private String pendingNativeRecordingRequestId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(255, 247, 250));
        window.setNavigationBarColor(Color.rgb(255, 247, 250));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            window.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR |
                View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            );
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(245, 241, 247));
        setContentView(webView);
        speechCompatibility = new SpeechCompatibilityBridge(this, webView);
        learningBackup = new LearningBackupBridge(this, webView);
        configureWebView();
        webView.loadUrl(MAIN_APP_URL);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            settings.setAllowFileAccessFromFileURLs(true);
            settings.setAllowUniversalAccessFromFileURLs(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        attachNativeBridge();
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (url != null && url.endsWith("/www/src/index.html")) {
                    view.clearHistory();
                }
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsAlert(
                WebView view,
                String url,
                String message,
                JsResult result
            ) {
                new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton("确定", (dialog, which) -> result.confirm())
                    .setOnCancelListener(dialog -> result.cancel())
                    .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(
                WebView view,
                String url,
                String message,
                JsResult result
            ) {
                new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton("确定", (dialog, which) -> result.confirm())
                    .setNegativeButton("取消", (dialog, which) -> result.cancel())
                    .setOnCancelListener(dialog -> result.cancel())
                    .show();
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (!isTrustedWebContent(webView, request)) {
                        request.deny();
                        return;
                    }
                    boolean asksAudio = false;
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                            asksAudio = true;
                        }
                    }
                    if (!asksAudio) {
                        request.deny();
                        return;
                    }
                    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
                        checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
                            PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
                    } else {
                        pendingPermissionRequest = request;
                        requestPermissions(
                            new String[] { Manifest.permission.RECORD_AUDIO },
                            AUDIO_PERMISSION_REQUEST
                        );
                    }
                });
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(
        int requestCode,
        String[] permissions,
        int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != AUDIO_PERMISSION_REQUEST) return;
        boolean granted = grantResults.length > 0 &&
            grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (pendingPermissionRequest != null) {
            if (granted) {
                pendingPermissionRequest.grant(
                    new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE }
                );
            } else {
                pendingPermissionRequest.deny();
            }
            pendingPermissionRequest = null;
        }
        if (pendingNativeRecordingRequestId != null) {
            String requestId = pendingNativeRecordingRequestId;
            pendingNativeRecordingRequestId = null;
            if (granted) {
                speechCompatibility.startRecording(requestId);
            } else {
                Toast.makeText(
                    MainActivity.this,
                    "麦克风权限未授予，跟读录音不可用",
                    Toast.LENGTH_LONG
                ).show();
                speechCompatibility.reportPermissionDenied(requestId);
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private void attachNativeBridge() {
        if (nativeBridgeAttached || webView == null) return;
        webView.addJavascriptInterface(new NativeBridge(), "SakuraNative");
        nativeBridgeAttached = true;
    }

    @Override
    protected void onPause() {
        if (speechCompatibility != null) {
            speechCompatibility.pausePlaybackAndRecording();
        }
        super.onPause();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (
            learningBackup != null &&
            learningBackup.onActivityResult(requestCode, resultCode, data)
        ) {
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onDestroy() {
        if (speechCompatibility != null) speechCompatibility.close();
        if (learningBackup != null) learningBackup.close();
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

    private boolean isTrustedWebContent(WebView view, PermissionRequest request) {
        Uri origin = request.getOrigin();
        String currentUrl = view.getUrl();
        if (origin == null || origin.getScheme() == null ||
            !"file".equalsIgnoreCase(origin.getScheme())) {
            return false;
        }
        if (currentUrl == null ||
            !currentUrl.startsWith("file:///android_asset/www/")) {
            return false;
        }
        String path = origin.getPath();
        return path == null || path.isEmpty() ||
            path.startsWith("/android_asset/www/");
    }

    private final class NativeBridge {
        @JavascriptInterface
        public String getVersion() {
            return "1.7.9-mobile";
        }

        @JavascriptInterface
        public void showToast(final String message) {
            runOnUiThread(() ->
                Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show()
            );
        }

        @JavascriptInterface
        public void openLanguageSettings() {
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(Settings.ACTION_SETTINGS));
                } catch (Exception error) {
                    Toast.makeText(
                        MainActivity.this,
                        "无法打开系统设置",
                        Toast.LENGTH_SHORT
                    ).show();
                }
            });
        }

        @JavascriptInterface
        public void openAppSettings() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(
                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + getPackageName())
                    );
                    startActivity(intent);
                } catch (Exception error) {
                    Toast.makeText(
                        MainActivity.this,
                        "无法打开应用权限设置",
                        Toast.LENGTH_SHORT
                    ).show();
                }
            });
        }

        @JavascriptInterface
        public String getSpeechCapabilities() {
            return speechCompatibility.getCapabilities();
        }

        @JavascriptInterface
        public void probeSpeechRecognition(final String requestId) {
            speechCompatibility.probeRecognition(requestId);
        }

        @JavascriptInterface
        public void startNativeAudioRecording(final String requestId) {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
                    checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
                        PackageManager.PERMISSION_GRANTED) {
                    speechCompatibility.startRecording(requestId);
                    return;
                }
                pendingNativeRecordingRequestId = requestId;
                requestPermissions(
                    new String[] { Manifest.permission.RECORD_AUDIO },
                    AUDIO_PERMISSION_REQUEST
                );
            });
        }

        @JavascriptInterface
        public void stopNativeAudioRecording() {
            runOnUiThread(() -> speechCompatibility.stopRecording());
        }

        @JavascriptInterface
        public void cancelNativeAudioRecording(final String requestId) {
            runOnUiThread(() -> {
                if (requestId != null &&
                    requestId.equals(pendingNativeRecordingRequestId)) {
                    pendingNativeRecordingRequestId = null;
                }
                speechCompatibility.cancelRecording();
            });
        }

        @JavascriptInterface
        public void startRecognizeWav(
            final String requestId,
            final String wavBase64
        ) {
            speechCompatibility.recognizeWav(requestId, wavBase64);
        }

        @JavascriptInterface
        public void speakJapaneseText(
            final String requestId,
            final String text
        ) {
            runOnUiThread(() ->
                speechCompatibility.speakJapanese(requestId, text)
            );
        }

        @JavascriptInterface
        public void stopJapaneseSpeech() {
            runOnUiThread(() -> speechCompatibility.stopSpeaking());
        }

        @JavascriptInterface
        public void exportLearningBackup(
            final String json,
            final String suggestedFileName
        ) {
            runOnUiThread(() ->
                learningBackup.beginExport(json, suggestedFileName)
            );
        }

        @JavascriptInterface
        public void importLearningBackup() {
            runOnUiThread(() -> learningBackup.beginImport());
        }

        @JavascriptInterface
        public void createLocalLearningBackup(
            final String json,
            final String suggestedFileName
        ) {
            learningBackup.createLocalBackup(json, suggestedFileName);
        }

        @JavascriptInterface
        public String getLocalLearningBackupInfo() {
            return learningBackup.getLocalBackupInfo();
        }

        @JavascriptInterface
        public void readLatestLocalLearningBackup() {
            learningBackup.readLatestLocalBackup();
        }

        @JavascriptInterface
        public String httpGet(String address) {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(address);
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(12000);
                connection.setReadTimeout(20000);
                connection.setRequestMethod("GET");
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("User-Agent", "Sakura-Mobile/1.0");
                int status = connection.getResponseCode();
                InputStream stream = status >= 400
                    ? connection.getErrorStream()
                    : connection.getInputStream();
                if (stream == null) {
                    throw new IllegalStateException("HTTP " + status);
                }
                BufferedReader reader = new BufferedReader(
                    new InputStreamReader(stream, StandardCharsets.UTF_8)
                );
                StringBuilder output = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    output.append(line);
                }
                reader.close();
                if (status >= 400) {
                    throw new IllegalStateException(output.toString());
                }
                return output.toString();
            } catch (Exception error) {
                throw new IllegalStateException(error.getMessage(), error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }
    }
}
