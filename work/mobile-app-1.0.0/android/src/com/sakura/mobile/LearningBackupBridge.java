package com.sakura.mobile;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.provider.OpenableColumns;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Iterator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Uses Android's Storage Access Framework so backups can be saved and loaded
 * without broad storage permissions or reliance on file:// paths.
 */
public final class LearningBackupBridge {
    public static final int REQUEST_EXPORT = 4201;
    public static final int REQUEST_IMPORT = 4202;
    private static final int MAX_BACKUP_BYTES = 10 * 1024 * 1024;

    private final Activity activity;
    private final WebView webView;
    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();
    private byte[] pendingExportBytes;
    private boolean waitingForResult;

    public LearningBackupBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    public void beginExport(String json, String suggestedFileName) {
        if (waitingForResult) {
            notifyExportError("另一个备份操作尚未结束");
            return;
        }
        if (json == null || json.isEmpty()) {
            notifyExportError("没有可导出的学习数据");
            return;
        }
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_BACKUP_BYTES) {
            notifyExportError("学习数据超过 10 MB，无法导出");
            return;
        }
        pendingExportBytes = bytes;
        waitingForResult = true;
        String fileName =
            suggestedFileName == null || suggestedFileName.trim().isEmpty()
                ? "Sakura-save.json"
                : suggestedFileName.trim();
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION |
            Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        );
        try {
            activity.startActivityForResult(intent, REQUEST_EXPORT);
        } catch (Exception error) {
            waitingForResult = false;
            pendingExportBytes = null;
            notifyExportError("无法打开系统保存界面：" + safeMessage(error));
        }
    }

    public void beginImport() {
        if (waitingForResult) {
            notifyImportError("另一个备份操作尚未结束");
            return;
        }
        waitingForResult = true;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(
            Intent.EXTRA_MIME_TYPES,
            new String[] {
                "application/json",
                "text/json",
                "text/plain",
                "application/octet-stream",
            }
        );
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            activity.startActivityForResult(intent, REQUEST_IMPORT);
        } catch (Exception error) {
            waitingForResult = false;
            notifyImportError("无法打开系统文件选择器：" + safeMessage(error));
        }
    }

    public void createLocalBackup(String json, String suggestedFileName) {
        if (json == null || json.isEmpty()) {
            notifyLocalExportError("没有可备份的学习数据");
            return;
        }
        final byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_BACKUP_BYTES) {
            notifyLocalExportError("学习数据超过 10 MB，无法备份");
            return;
        }
        final String fileName = safeFileName(
            suggestedFileName == null || suggestedFileName.trim().isEmpty()
                ? "Sakura-save.json"
                : suggestedFileName.trim()
        );
        ioExecutor.execute(() -> writeLocalBackup(bytes, fileName));
    }

    public String getLocalBackupInfo() {
        try {
            File directory = localBackupDirectory();
            File[] files = backupFiles(directory);
            JSONObject result = result("ok", true)
                .put("directory", directory.getAbsolutePath())
                .put("count", files.length);
            if (files.length > 0) {
                File latest = files[0];
                result.put(
                    "latest",
                    result(
                        "fileName",
                        latest.getName(),
                        "bytes",
                        latest.length(),
                        "modifiedAt",
                        latest.lastModified()
                    )
                );
            }
            return result.toString();
        } catch (Exception error) {
            return result(
                "ok",
                false,
                "error",
                "无法读取本地备份目录：" + safeMessage(error)
            ).toString();
        }
    }

    public void readLatestLocalBackup() {
        ioExecutor.execute(() -> {
            File[] files = backupFiles(localBackupDirectory());
            int skipped = 0;
            String lastError = "";
            for (File file : files) {
                try {
                    if (file.length() > MAX_BACKUP_BYTES) {
                        skipped += 1;
                        lastError = "备份文件超过 10 MB";
                        continue;
                    }
                    String text = readTextFile(file);
                    validateBackup(text);
                    postBackupResult(
                        "latestImportFinished",
                        result(
                            "ok",
                            true,
                            "fileName",
                            file.getName(),
                            "bytes",
                            file.length(),
                            "modifiedAt",
                            file.lastModified(),
                            "skipped",
                            skipped,
                            "text",
                            text
                        )
                    );
                    return;
                } catch (Exception error) {
                    skipped += 1;
                    lastError = safeMessage(error);
                    // Skip a damaged backup and try the previous valid one.
                }
            }
            postBackupResult(
                "latestImportFinished",
                result(
                    "ok",
                    false,
                    "error",
                    files.length == 0
                        ? "应用备份目录中还没有可恢复的有效备份"
                        : "最近备份均无法恢复：" + lastError
                )
            );
        });
    }

    public boolean onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQUEST_EXPORT && requestCode != REQUEST_IMPORT) {
            return false;
        }
        waitingForResult = false;
        if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
            pendingExportBytes = null;
            if (requestCode == REQUEST_EXPORT) {
                notifyExportCanceled();
            } else {
                notifyImportCanceled();
            }
            return true;
        }

        Uri uri = data.getData();
        if (requestCode == REQUEST_EXPORT) {
            byte[] bytes = pendingExportBytes;
            pendingExportBytes = null;
            if (bytes == null) {
                notifyExportError("导出数据已失效，请重试");
                return true;
            }
            String fileName = displayName(uri, "Sakura-save.json");
            ioExecutor.execute(() -> writeBackup(uri, bytes, fileName));
        } else {
            String fileName = displayName(uri, "Sakura-save.json");
            ioExecutor.execute(() -> readBackup(uri, fileName));
        }
        return true;
    }

    public void close() {
        ioExecutor.shutdownNow();
        try {
            ioExecutor.awaitTermination(2, TimeUnit.SECONDS);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        }
    }

    private void writeBackup(Uri uri, byte[] bytes, String fileName) {
        try (OutputStream output =
                 activity.getContentResolver().openOutputStream(uri, "wt")) {
            if (output == null) throw new IllegalStateException("无法打开目标文件");
            output.write(bytes);
            output.flush();
            notifyExportSuccess(fileName, bytes.length);
        } catch (Exception error) {
            notifyExportError("保存备份失败：" + safeMessage(error));
        }
    }

    private void writeLocalBackup(byte[] bytes, String requestedName) {
        try {
            File directory = localBackupDirectory();
            if (!directory.mkdirs() && !directory.isDirectory()) {
                throw new IllegalStateException("无法创建默认备份目录");
            }
            File target = uniqueBackupFile(directory, requestedName);
            File temporary = new File(
                directory,
                target.getName() + ".writing"
            );
            try (FileOutputStream output = new FileOutputStream(temporary)) {
                output.write(bytes);
                output.getFD().sync();
            }
            if (!temporary.renameTo(target)) {
                throw new IllegalStateException("无法完成默认备份文件");
            }
            pruneOldBackups(directory, 20);
            postBackupResult(
                "localExportFinished",
                result(
                    "ok",
                    true,
                    "fileName",
                    target.getName(),
                    "bytes",
                    target.length(),
                    "filePath",
                    target.getAbsolutePath(),
                    "directory",
                    directory.getAbsolutePath()
                )
            );
        } catch (Exception error) {
            notifyLocalExportError("写入默认备份失败：" + safeMessage(error));
        }
    }

    private String readTextFile(File file) throws Exception {
        try (FileInputStream input = new FileInputStream(file)) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[16 * 1024];
            int total = 0;
            int count;
            while ((count = input.read(buffer)) != -1) {
                total += count;
                if (total > MAX_BACKUP_BYTES) {
                    throw new IllegalArgumentException("备份文件超过 10 MB");
                }
                output.write(buffer, 0, count);
            }
            return decodeUtf8(output.toByteArray());
        }
    }

    private File localBackupDirectory() {
        File external = activity.getExternalFilesDir(
            Environment.DIRECTORY_DOCUMENTS
        );
        File base = external != null ? external : activity.getFilesDir();
        return new File(base, "Sakura/Backups");
    }

    private File[] backupFiles(File directory) {
        File[] files = directory.listFiles(
            file ->
                file.isFile() &&
                file.getName().toLowerCase().endsWith(".json")
        );
        if (files == null) return new File[0];
        Arrays.sort(
            files,
            Comparator
                .comparingLong(File::lastModified)
                .reversed()
                .thenComparing(File::getName, Comparator.reverseOrder())
        );
        return files;
    }

    private File uniqueBackupFile(File directory, String requestedName) {
        File target = new File(directory, requestedName);
        if (!target.exists()) return target;
        String base = requestedName.toLowerCase().endsWith(".json")
            ? requestedName.substring(0, requestedName.length() - 5)
            : requestedName;
        for (int index = 2; index < 1000; index += 1) {
            target = new File(directory, base + "-" + index + ".json");
            if (!target.exists()) return target;
        }
        throw new IllegalStateException("无法生成不冲突的备份文件名");
    }

    private void pruneOldBackups(File directory, int keepCount) {
        File[] files = backupFiles(directory);
        for (int index = keepCount; index < files.length; index += 1) {
            files[index].delete();
        }
    }

    private static String safeFileName(String value) {
        String name = value.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        if (!name.toLowerCase().endsWith(".json")) name += ".json";
        return name.length() > 120 ? name.substring(name.length() - 120) : name;
    }

    private static void validateBackup(String text) {
        JSONObject root;
        try {
            root = new JSONObject(text);
        } catch (Exception error) {
            throw new IllegalArgumentException("不是有效的 JSON 备份");
        }
        String app = root.optString("app", "");
        if (!app.isEmpty() && !"nihongo-journey".equals(app)) {
            throw new IllegalArgumentException("不是 Sakura / 日语次元备份");
        }
        if (root.has("format") && root.optInt("format", -1) != 1) {
            throw new IllegalArgumentException(
                "暂不支持备份格式版本 " + root.opt("format")
            );
        }
        JSONObject state = root.optJSONObject("state");
        if (state == null) state = root;
        Iterator<String> keys = state.keys();
        if (!keys.hasNext()) {
            throw new IllegalArgumentException("备份中没有学习数据");
        }
    }

    private void readBackup(Uri uri, String fileName) {
        try (
            InputStream input =
                activity.getContentResolver().openInputStream(uri)
        ) {
            if (input == null) throw new IllegalStateException("无法打开所选文件");
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[16 * 1024];
            int total = 0;
            int count;
            while ((count = input.read(buffer)) != -1) {
                total += count;
                if (total > MAX_BACKUP_BYTES) {
                    throw new IllegalArgumentException("备份文件超过 10 MB");
                }
                output.write(buffer, 0, count);
            }
            String text = decodeUtf8(output.toByteArray());
            notifyImportSuccess(fileName, total, text);
        } catch (Exception error) {
            notifyImportError("读取备份失败：" + safeMessage(error));
        }
    }

    private String displayName(Uri uri, String fallback) {
        try (
            Cursor cursor = activity.getContentResolver().query(
                uri,
                new String[] { OpenableColumns.DISPLAY_NAME },
                null,
                null,
                null
            )
        ) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) {
                    String name = cursor.getString(index);
                    if (name != null && !name.trim().isEmpty()) return name.trim();
                }
            }
        } catch (Exception ignored) {
            // The document provider may not expose a display name.
        }
        return fallback;
    }

    private static String decodeUtf8(byte[] bytes) throws CharacterCodingException {
        int offset = bytes.length >= 3 &&
            (bytes[0] & 0xff) == 0xef &&
            (bytes[1] & 0xff) == 0xbb &&
            (bytes[2] & 0xff) == 0xbf
            ? 3
            : 0;
        return StandardCharsets.UTF_8
            .newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(bytes, offset, bytes.length - offset))
            .toString();
    }

    private void notifyExportSuccess(String fileName, int bytes) {
        postBackupResult(
            "exportFinished",
            result("ok", true, "fileName", fileName, "bytes", bytes)
        );
    }

    private void notifyExportCanceled() {
        postBackupResult(
            "exportFinished",
            result("ok", false, "canceled", true)
        );
    }

    private void notifyExportError(String message) {
        postBackupResult(
            "exportFinished",
            result("ok", false, "error", message)
        );
    }

    private void notifyImportSuccess(String fileName, int bytes, String text) {
        postBackupResult(
            "importFinished",
            result(
                "ok",
                true,
                "fileName",
                fileName,
                "bytes",
                bytes,
                "text",
                text
            )
        );
    }

    private void notifyImportCanceled() {
        postBackupResult(
            "importFinished",
            result("ok", false, "canceled", true)
        );
    }

    private void notifyImportError(String message) {
        postBackupResult(
            "importFinished",
            result("ok", false, "error", message)
        );
    }

    private void notifyLocalExportError(String message) {
        postBackupResult(
            "localExportFinished",
            result("ok", false, "error", message)
        );
    }

    private static JSONObject result(Object... pairs) {
        JSONObject payload = new JSONObject();
        try {
            for (int index = 0; index + 1 < pairs.length; index += 2) {
                payload.put(String.valueOf(pairs[index]), pairs[index + 1]);
            }
            return payload;
        } catch (Exception error) {
            throw new IllegalStateException("无法生成备份结果", error);
        }
    }

    private void postBackupResult(String method, JSONObject payload) {
        postJavascript(
            "window.SakuraMobileBackup&&window.SakuraMobileBackup." +
                method + "(" + payload + ");"
        );
    }

    private void postJavascript(String script) {
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private static String safeMessage(Throwable error) {
        String message = error == null ? "" : error.getMessage();
        return message == null || message.trim().isEmpty()
            ? "未知错误"
            : message.trim();
    }
}
