package com.sakura.mobile;

import android.content.Context;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;
import org.vosk.LibVosk;
import org.vosk.LogLevel;
import org.vosk.Model;
import org.vosk.Recognizer;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Keeps Android microphone capture and offline recognition independent from
 * WebView implementations of getUserMedia and Web Speech API.
 */
public final class SpeechCompatibilityBridge {
    private static final String MODEL_ASSET = "vosk-model-small-ja-0.22.zip";
    private static final String MODEL_DIRECTORY = "vosk-model-small-ja-0.22";
    private static final int TARGET_SAMPLE_RATE = 16000;
    private static final int MAX_RECORDING_SECONDS = 10;

    private final Context context;
    private final WebView webView;
    private final ExecutorService recognitionExecutor =
        Executors.newSingleThreadExecutor();
    private final Object recorderLock = new Object();
    private final Object modelLock = new Object();

    private volatile boolean recording;
    private volatile boolean cancelRequested;
    private volatile String recordingRequestId;
    private volatile AudioRecord audioRecord;
    private volatile Model model;
    private TextToSpeech textToSpeech;
    private int textToSpeechState;
    private String activeSpeechId;
    private String pendingSpeechId;
    private String pendingSpeechText;

    public SpeechCompatibilityBridge(Context context, WebView webView) {
        this.context = context.getApplicationContext();
        this.webView = webView;
    }

    public String getCapabilities() {
        boolean modelBundled = assetExists(MODEL_ASSET);
        boolean modelReady = model != null;
        return "{"
            + "\"ok\":" + modelBundled + ","
            + "\"nativeRecording\":true,"
            + "\"recognitionBundled\":" + modelBundled + ","
            + "\"recognitionReady\":" + modelReady + ","
            + "\"engine\":\"Vosk\","
            + "\"model\":\"vosk-model-small-ja-0.22\","
            + "\"tts\":\"android-system\","
            + "\"recognitionOffline\":true,"
            + "\"ttsMayRequireNetwork\":true"
            + "}";
    }

    public void probeRecognition(String requestId) {
        recognitionExecutor.execute(() -> {
            Recognizer probe = null;
            try {
                Model loadedModel = getModel();
                probe = new Recognizer(loadedModel, TARGET_SAMPLE_RATE);
                notifyRecognitionProbe(
                    requestId,
                    true,
                    "离线识别模型已就绪",
                    ""
                );
            } catch (Throwable error) {
                notifyRecognitionProbe(
                    requestId,
                    false,
                    recognitionErrorMessage(error),
                    recognitionErrorCode(error)
                );
            } finally {
                if (probe != null) probe.close();
            }
        });
    }

    public void startRecording(String requestId) {
        if (requestId == null || requestId.isEmpty()) {
            notifyRecordingError("", "invalid-request", "录音请求无效，请重试。");
            return;
        }
        synchronized (recorderLock) {
            if (recording) {
                notifyRecordingError(
                    requestId,
                    "recorder-busy",
                    "上一段录音仍在处理中，请稍后重试。"
                );
                return;
            }
            recording = true;
            cancelRequested = false;
            recordingRequestId = requestId;
            int sampleRate = chooseSampleRate();
            Thread recorderThread = new Thread(
                () -> captureRecording(requestId, sampleRate),
                "SakuraAudioRecorder"
            );
            recorderThread.start();
        }
    }

    public void stopRecording() {
        synchronized (recorderLock) {
            if (!recording) return;
            recording = false;
            releaseAudioRecord();
        }
    }

    public void cancelRecording() {
        synchronized (recorderLock) {
            cancelRequested = true;
            recording = false;
            releaseAudioRecord();
        }
    }

    public boolean isRecording() {
        return recording;
    }

    public void pausePlaybackAndRecording() {
        if (recording) stopRecording();
        stopSpeaking();
    }

    public void speakJapanese(String requestId, String text) {
        if (requestId == null || requestId.isEmpty() ||
            text == null || text.trim().isEmpty()) {
            notifyTtsError(
                requestId == null ? "" : requestId,
                "朗读文本无效",
                "invalid-request"
            );
            return;
        }
        if (activeSpeechId != null && !activeSpeechId.equals(requestId)) {
            notifyTtsError(
                activeSpeechId,
                "朗读已由新的播放请求替换",
                "superseded"
            );
        }
        activeSpeechId = requestId;
        pendingSpeechId = requestId;
        pendingSpeechText = text;
        if (textToSpeechState == 0) {
            initializeTextToSpeech();
            return;
        }
        if (textToSpeechState < 0) {
            textToSpeechState = 0;
            initializeTextToSpeech();
            return;
        }
        speakPendingText();
    }

    public void stopSpeaking() {
        if (textToSpeech != null) {
            try {
                textToSpeech.stop();
            } catch (Throwable ignored) {
                // Engine may already be shutting down.
            }
        }
        if (activeSpeechId != null) {
            notifyTtsError(
                activeSpeechId,
                "朗读已停止",
                "canceled"
            );
        }
        activeSpeechId = null;
        pendingSpeechId = null;
        pendingSpeechText = null;
    }

    public void reportPermissionDenied(String requestId) {
        notifyRecordingError(
            requestId == null ? "" : requestId,
            "microphone-permission-denied",
            "麦克风权限未授予。请允许录音，或到系统设置中为 Sakura 打开麦克风权限。"
        );
    }

    public void recognizeWav(String requestId, String wavBase64) {
        recognitionExecutor.execute(() -> {
            try {
                if (requestId == null || requestId.isEmpty()) {
                    throw new IllegalArgumentException("识别请求无效");
                }
                if (wavBase64 == null || wavBase64.isEmpty()) {
                    throw new IllegalArgumentException("录音数据为空");
                }
                if (wavBase64.length() > 2_000_000) {
                    throw new IllegalArgumentException("录音数据过大");
                }
                byte[] wav = Base64.decode(wavBase64, Base64.DEFAULT);
                PcmAudio pcm = parsePcmWav(wav);
                if (pcm.sampleRate != TARGET_SAMPLE_RATE ||
                    pcm.channels != 1 ||
                    pcm.bitsPerSample != 16) {
                    throw new IllegalArgumentException(
                        "识别音频必须是 16 kHz、单声道、16 位 PCM WAV"
                    );
                }

                Model loadedModel = getModel();
                Recognizer recognizer = null;
                try {
                    recognizer = new Recognizer(loadedModel, pcm.sampleRate);
                    recognizer.setWords(true);
                    recognizer.acceptWaveForm(pcm.samples, pcm.samples.length);
                    JSONObject result =
                        new JSONObject(recognizer.getFinalResult());
                    String text = result.optString("text", "").trim();
                    if (text.isEmpty()) {
                        throw new IllegalStateException(
                            "没有识别出稳定的日语文本。请靠近麦克风，放慢语速后重试。"
                        );
                    }
                    result.put("ok", true);
                    result.put("engine", "Vosk");
                    result.put("model", "vosk-model-small-ja-0.22");
                    result.put("offline", true);
                    double confidence = averageConfidence(result);
                    if (Double.isFinite(confidence)) {
                        result.put("confidence", confidence);
                    }
                    notifySpeechResult(requestId, result.toString());
                } finally {
                    if (recognizer != null) recognizer.close();
                }
            } catch (Throwable error) {
                notifySpeechError(
                    requestId == null ? "" : requestId,
                    recognitionErrorMessage(error),
                    recognitionErrorCode(error)
                );
            }
        });
    }

    public void close() {
        cancelRecording();
        stopSpeaking();
        if (textToSpeech != null) {
            try {
                textToSpeech.shutdown();
            } catch (Throwable ignored) {
                // TTS may not have completed initialization.
            }
            textToSpeech = null;
        }
        recognitionExecutor.shutdownNow();
        try {
            recognitionExecutor.awaitTermination(2, TimeUnit.SECONDS);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        }
        synchronized (modelLock) {
            if (model != null) {
                try {
                    model.close();
                } catch (Throwable ignored) {
                    // Native model may already be released during shutdown.
                }
                model = null;
            }
        }
    }

    private void initializeTextToSpeech() {
        if (textToSpeech != null) {
            try {
                textToSpeech.shutdown();
            } catch (Throwable ignored) {
                // Replace a failed or stale engine instance.
            }
            textToSpeech = null;
        }
        textToSpeechState = 1;
        textToSpeech = new TextToSpeech(context, status -> {
            if (status != TextToSpeech.SUCCESS || textToSpeech == null) {
                textToSpeechState = -1;
                String requestId = pendingSpeechId;
                pendingSpeechId = null;
                pendingSpeechText = null;
                activeSpeechId = null;
                notifyTtsError(
                    requestId == null ? "" : requestId,
                    "Android 系统没有可用的日语语音引擎，请安装或启用系统 TTS 日语语音。",
                    "tts-unavailable"
                );
                return;
            }
            int availability = textToSpeech.isLanguageAvailable(Locale.JAPANESE);
            int languageResult = textToSpeech.setLanguage(Locale.JAPANESE);
            if (
                availability < TextToSpeech.LANG_AVAILABLE ||
                languageResult < TextToSpeech.LANG_AVAILABLE
            ) {
                textToSpeechState = -1;
                String requestId = pendingSpeechId;
                pendingSpeechId = null;
                pendingSpeechText = null;
                activeSpeechId = null;
                notifyTtsError(
                    requestId == null ? "" : requestId,
                    "Android 系统 TTS 尚未安装日语语音数据，请到系统语音设置中下载日语语音。",
                    "tts-japanese-unavailable"
                );
                return;
            }
            textToSpeechState = 2;
            textToSpeech.setSpeechRate(0.85f);
            textToSpeech.setOnUtteranceProgressListener(
                new UtteranceProgressListener() {
                    @Override
                    public void onStart(String utteranceId) {
                        if (!utteranceId.equals(activeSpeechId)) return;
                        notifyTtsStarted(utteranceId);
                    }

                    @Override
                    public void onDone(String utteranceId) {
                        if (!utteranceId.equals(activeSpeechId)) return;
                        activeSpeechId = null;
                        notifyTtsCompleted(utteranceId);
                    }

                    @Override
                    public void onError(String utteranceId) {
                        onError(utteranceId, TextToSpeech.ERROR);
                    }

                    @Override
                    public void onError(String utteranceId, int errorCode) {
                        if (!utteranceId.equals(activeSpeechId)) return;
                        activeSpeechId = null;
                        notifyTtsError(
                            utteranceId,
                            "Android 日语朗读失败，错误码 " + errorCode,
                            "tts-error"
                        );
                    }

                    @Override
                    public void onStop(String utteranceId, boolean interrupted) {
                        if (!utteranceId.equals(activeSpeechId)) return;
                        activeSpeechId = null;
                        notifyTtsError(
                            utteranceId,
                            interrupted ? "朗读已被新的播放替换" : "朗读已停止",
                            interrupted ? "superseded" : "canceled"
                        );
                    }
                }
            );
            speakPendingText();
        });
    }

    private void speakPendingText() {
        if (
            textToSpeechState != 2 ||
            textToSpeech == null ||
            pendingSpeechId == null ||
            pendingSpeechText == null
        ) {
            return;
        }
        String requestId = pendingSpeechId;
        String text = pendingSpeechText;
        pendingSpeechId = null;
        pendingSpeechText = null;
        textToSpeech.stop();
        int status = textToSpeech.speak(
            text,
            TextToSpeech.QUEUE_FLUSH,
            new Bundle(),
            requestId
        );
        if (status != TextToSpeech.SUCCESS) {
            activeSpeechId = null;
            notifyTtsError(
                requestId,
                "无法启动 Android 日语朗读，请检查系统语音引擎。",
                "tts-start-failed"
            );
        }
    }

    private int chooseSampleRate() {
        int minimum = AudioRecord.getMinBufferSize(
            TARGET_SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        );
        if (minimum > 0) return TARGET_SAMPLE_RATE;
        minimum = AudioRecord.getMinBufferSize(
            44100,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        );
        return minimum > 0 ? 44100 : TARGET_SAMPLE_RATE;
    }

    private void captureRecording(String requestId, int sampleRate) {
        AudioRecord recorder = null;
        ByteArrayOutputStream pcmOutput = new ByteArrayOutputStream();
        try {
            int minimumBuffer = AudioRecord.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            );
            if (minimumBuffer <= 0) {
                throw new IllegalStateException("设备不支持当前录音格式");
            }
            recorder = createAudioRecord(sampleRate, minimumBuffer);
            if (recorder == null) {
                throw new IllegalStateException("无法初始化麦克风录音");
            }
            synchronized (recorderLock) {
                if (!recording || cancelRequested) return;
                audioRecord = recorder;
            }
            recorder.startRecording();
            if (recorder.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
                throw new IllegalStateException("麦克风没有进入录音状态");
            }
            notifyRecordingStarted(requestId, sampleRate);

            int bufferSize = Math.max(1024, minimumBuffer / 2);
            short[] buffer = new short[bufferSize];
            long lastLevelAt = 0L;
            int maximumSamples = sampleRate * MAX_RECORDING_SECONDS;
            int capturedSamples = 0;

            while (recording && !cancelRequested && capturedSamples < maximumSamples) {
                int count = recorder.read(buffer, 0, buffer.length);
                if (count < 0) {
                    throw new IllegalStateException("麦克风读取失败：" + count);
                }
                if (count == 0) continue;

                long sumSquares = 0L;
                int limit = Math.min(count, maximumSamples - capturedSamples);
                for (int index = 0; index < limit; index += 1) {
                    short value = buffer[index];
                    pcmOutput.write(value & 0xff);
                    pcmOutput.write((value >>> 8) & 0xff);
                    sumSquares += value * value;
                }
                capturedSamples += limit;

                long now = System.currentTimeMillis();
                if (now - lastLevelAt >= 90L) {
                    lastLevelAt = now;
                    double rms = Math.sqrt(
                        (double) sumSquares / Math.max(1, limit)
                    ) / 32768.0;
                    int level = (int) Math.min(100.0, Math.sqrt(rms) * 240.0);
                    notifyRecordingLevel(requestId, level);
                }
            }

            if (cancelRequested) return;
            if (pcmOutput.size() == 0) {
                throw new IllegalStateException(
                    "没有采集到有效音频，请确认麦克风没有被其他应用占用"
                );
            }
            byte[] pcm = pcmOutput.toByteArray();
            byte[] wav = createWav(pcm, sampleRate);
            double duration = (double) capturedSamples / sampleRate;
            notifyRecordingStopped(
                requestId,
                Base64.encodeToString(wav, Base64.NO_WRAP),
                sampleRate,
                duration
            );
        } catch (SecurityException error) {
            if (!cancelRequested) {
                notifyRecordingError(
                    requestId,
                    "microphone-permission-denied",
                    "麦克风权限未授予。请允许录音，或到系统设置中为 Sakura 打开麦克风权限。"
                );
            }
        } catch (Throwable error) {
            if (!cancelRequested) {
                notifyRecordingError(
                    requestId,
                    "recording-failed",
                    error.getMessage() == null
                        ? "麦克风录音失败，请重试。"
                        : error.getMessage()
                );
            }
        } finally {
            synchronized (recorderLock) {
                recording = false;
                if (audioRecord == recorder) audioRecord = null;
                if (requestId.equals(recordingRequestId)) {
                    recordingRequestId = null;
                }
            }
            if (recorder != null) {
                try {
                    recorder.stop();
                } catch (Throwable ignored) {
                    // Recorder can already be stopped after a read failure.
                }
                recorder.release();
            }
            notifyRecordingLevel(requestId, 0);
        }
    }

    private AudioRecord createAudioRecord(int sampleRate, int minimumBuffer) {
        int[] sources = new int[] {
            MediaRecorder.AudioSource.MIC,
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            MediaRecorder.AudioSource.DEFAULT,
        };
        for (int source : sources) {
            AudioRecord candidate = null;
            try {
                candidate = new AudioRecord(
                    source,
                    sampleRate,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    minimumBuffer * 2
                );
                if (candidate.getState() == AudioRecord.STATE_INITIALIZED) {
                    return candidate;
                }
            } catch (Throwable ignored) {
                // Try the next supported input source.
            }
            if (candidate != null) candidate.release();
        }
        return null;
    }

    private void releaseAudioRecord() {
        AudioRecord recorder = audioRecord;
        if (recorder == null) return;
        try {
            recorder.stop();
        } catch (Throwable ignored) {
            // Stopping an already stopped recorder is safe to ignore.
        }
    }

    private synchronized Model getModel() throws IOException {
        synchronized (modelLock) {
            if (model != null) return model;
            File modelDirectory = ensureModelExtracted();
            LibVosk.setLogLevel(LogLevel.WARNINGS);
            model = new Model(modelDirectory.getAbsolutePath());
            return model;
        }
    }

    private File ensureModelExtracted() throws IOException {
        File modelDirectory = new File(
            context.getFilesDir(),
            MODEL_DIRECTORY
        );
        if (modelReady(modelDirectory)) return modelDirectory;
        if (!assetExists(MODEL_ASSET)) {
            throw new IOException("离线日语识别模型未随应用安装");
        }

        File temporary = new File(
            context.getFilesDir(),
            MODEL_DIRECTORY + ".extracting"
        );
        deleteTree(temporary);
        if (!temporary.mkdirs() && !temporary.isDirectory()) {
            throw new IOException("无法创建离线模型目录");
        }

        try (
            InputStream input = context.getAssets().open(MODEL_ASSET);
            ZipInputStream zip = new ZipInputStream(input)
        ) {
            ZipEntry entry;
            byte[] buffer = new byte[32 * 1024];
            while ((entry = zip.getNextEntry()) != null) {
                String normalized = entry.getName().replace('\\', '/');
                if (normalized.startsWith("/") ||
                    normalized.contains("../") ||
                    normalized.indexOf(':') >= 0) {
                    throw new IOException("模型压缩包包含无效路径");
                }
                File target = new File(temporary, normalized);
                String rootPath = temporary.getCanonicalPath() + File.separator;
                if (!target.getCanonicalPath().startsWith(rootPath)) {
                    throw new IOException("模型压缩包路径越界");
                }
                if (entry.isDirectory()) {
                    if (!target.mkdirs() && !target.isDirectory()) {
                        throw new IOException("无法创建模型子目录");
                    }
                    continue;
                }
                File parent = target.getParentFile();
                if (parent != null && !parent.mkdirs() && !parent.isDirectory()) {
                    throw new IOException("无法创建模型目录");
                }
                try (FileOutputStream output = new FileOutputStream(target)) {
                    int count;
                    while ((count = zip.read(buffer)) > 0) {
                        output.write(buffer, 0, count);
                    }
                }
            }
        } catch (Throwable error) {
            deleteTree(temporary);
            if (error instanceof IOException) throw (IOException) error;
            throw new IOException("解压离线识别模型失败", error);
        }

        File extractedRoot = new File(temporary, MODEL_DIRECTORY);
        if (!modelReady(extractedRoot)) {
            deleteTree(temporary);
            throw new IOException("离线识别模型文件不完整");
        }
        deleteTree(modelDirectory);
        if (!extractedRoot.renameTo(modelDirectory)) {
            deleteTree(temporary);
            throw new IOException("无法启用离线识别模型");
        }
        deleteTree(temporary);
        return modelDirectory;
    }

    private static boolean modelReady(File directory) {
        return new File(directory, "conf/model.conf").isFile() &&
            new File(directory, "am/final.mdl").isFile() &&
            new File(directory, "graph/HCLr.fst").isFile();
    }

    private boolean assetExists(String name) {
        try (InputStream ignored = context.getAssets().open(name)) {
            return true;
        } catch (IOException error) {
            return false;
        }
    }

    private static void deleteTree(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) deleteTree(child);
        }
        file.delete();
    }

    private static PcmAudio parsePcmWav(byte[] wav) throws IOException {
        if (wav.length < 44 ||
            !asciiEquals(wav, 0, "RIFF") ||
            !asciiEquals(wav, 8, "WAVE")) {
            throw new IOException("录音不是有效的 WAV 文件");
        }
        int offset = 12;
        int format = -1;
        int channels = -1;
        int sampleRate = -1;
        int bitsPerSample = -1;
        byte[] samples = null;
        while (offset + 8 <= wav.length) {
            int chunkSize = littleEndianInt(wav, offset + 4);
            int contentOffset = offset + 8;
            if (chunkSize < 0 || contentOffset + chunkSize > wav.length) {
                throw new IOException("WAV 数据块长度无效");
            }
            if (asciiEquals(wav, offset, "fmt ") && chunkSize >= 16) {
                format = littleEndianShort(wav, contentOffset);
                channels = littleEndianShort(wav, contentOffset + 2);
                sampleRate = littleEndianInt(wav, contentOffset + 4);
                bitsPerSample = littleEndianShort(wav, contentOffset + 14);
            } else if (asciiEquals(wav, offset, "data")) {
                samples = new byte[chunkSize];
                System.arraycopy(wav, contentOffset, samples, 0, chunkSize);
                break;
            }
            offset = contentOffset + chunkSize + (chunkSize & 1);
        }
        if (format != 1 || channels <= 0 || sampleRate <= 0 ||
            bitsPerSample != 16 || samples == null || samples.length == 0) {
            throw new IOException("WAV 必须是未压缩的 PCM 音频");
        }
        return new PcmAudio(samples, sampleRate, channels, bitsPerSample);
    }

    private static byte[] createWav(byte[] pcm, int sampleRate) {
        ByteBuffer output = ByteBuffer
            .allocate(44 + pcm.length)
            .order(ByteOrder.LITTLE_ENDIAN);
        output.put("RIFF".getBytes());
        output.putInt(36 + pcm.length);
        output.put("WAVE".getBytes());
        output.put("fmt ".getBytes());
        output.putInt(16);
        output.putShort((short) 1);
        output.putShort((short) 1);
        output.putInt(sampleRate);
        output.putInt(sampleRate * 2);
        output.putShort((short) 2);
        output.putShort((short) 16);
        output.put("data".getBytes());
        output.putInt(pcm.length);
        output.put(pcm);
        return output.array();
    }

    private static boolean asciiEquals(byte[] value, int offset, String text) {
        if (offset < 0 || offset + text.length() > value.length) return false;
        for (int index = 0; index < text.length(); index += 1) {
            if (value[offset + index] != (byte) text.charAt(index)) return false;
        }
        return true;
    }

    private static int littleEndianInt(byte[] value, int offset) {
        return (value[offset] & 0xff) |
            ((value[offset + 1] & 0xff) << 8) |
            ((value[offset + 2] & 0xff) << 16) |
            ((value[offset + 3] & 0xff) << 24);
    }

    private static int littleEndianShort(byte[] value, int offset) {
        return (value[offset] & 0xff) |
            ((value[offset + 1] & 0xff) << 8);
    }

    private static double averageConfidence(JSONObject result) {
        JSONArray words = result.optJSONArray("result");
        if (words == null || words.length() == 0) return Double.NaN;
        double total = 0.0;
        int count = 0;
        for (int index = 0; index < words.length(); index += 1) {
            JSONObject word = words.optJSONObject(index);
            if (word == null || !word.has("conf")) continue;
            total += word.optDouble("conf", 0.0);
            count += 1;
        }
        return count > 0 ? total / count : Double.NaN;
    }

    private static String recognitionErrorMessage(Throwable error) {
        String message = error == null ? "" : error.getMessage();
        if (message == null || message.trim().isEmpty()) {
            return "本地日语识别失败，请重新录音后重试。";
        }
        if (message.contains("Failed to create a model") ||
            message.contains("vosk")) {
            return "离线识别模型初始化失败，请重新安装应用或重试。";
        }
        return message;
    }

    private static String recognitionErrorCode(Throwable error) {
        if (error instanceof OutOfMemoryError) return "out-of-memory";
        if (error instanceof UnsatisfiedLinkError) return "native-load-failed";
        String message = error == null ? "" : String.valueOf(error.getMessage());
        if (message.contains("未随应用安装")) return "model-missing";
        if (message.contains("没有识别出")) return "no-match";
        if (message.contains("WAV") || message.contains("录音")) {
            return "invalid-audio";
        }
        if (
            message.contains("Failed to create a model") ||
            message.contains("model") ||
            message.contains("模型")
        ) {
            return "model-init-failed";
        }
        return "recognition-failed";
    }

    private void notifyRecordingStarted(String requestId, int sampleRate) {
        postJavascript(
            "window.SakuraMobileMedia&&window.SakuraMobileMedia.recordingStarted(" +
                JSONObject.quote(requestId) + "," + sampleRate + ");"
        );
    }

    private void notifyRecordingLevel(String requestId, int level) {
        postJavascript(
            "window.SakuraMobileMedia&&window.SakuraMobileMedia.recordingLevel(" +
                JSONObject.quote(requestId) + "," + level + ");"
        );
    }

    private void notifyRecordingStopped(
        String requestId,
        String wavBase64,
        int sampleRate,
        double durationSeconds
    ) {
        String payload = "{"
            + "\"ok\":true,"
            + "\"wavBase64\":\"" + wavBase64 + "\","
            + "\"sampleRate\":" + sampleRate + ","
            + "\"durationSeconds\":" + durationSeconds
            + "}";
        postJavascript(
            "window.SakuraMobileMedia&&window.SakuraMobileMedia.recordingStopped(" +
                JSONObject.quote(requestId) + "," + payload + ");"
        );
    }

    private void notifyRecordingError(
        String requestId,
        String code,
        String message
    ) {
        postJavascript(
            "window.SakuraMobileMedia&&window.SakuraMobileMedia.recordingError(" +
                JSONObject.quote(requestId) + "," +
                JSONObject.quote(code) + "," +
                JSONObject.quote(message) + ");"
        );
    }

    private void notifySpeechResult(String requestId, String resultJson) {
        postJavascript(
            "window.SakuraMobileMedia&&window.SakuraMobileMedia.speechResult(" +
                JSONObject.quote(requestId) + "," + resultJson + ");"
        );
    }

    private void notifySpeechError(
        String requestId,
        String message,
        String code
    ) {
        postJavascript(
            "window.SakuraMobileMedia&&window.SakuraMobileMedia.speechError(" +
                JSONObject.quote(requestId) + "," +
                JSONObject.quote(message) + "," +
                JSONObject.quote(code) + ");"
        );
    }

    private void notifyRecognitionProbe(
        String requestId,
        boolean ok,
        String message,
        String code
    ) {
        postJavascript(
            "window.SakuraMobileMedia&&window.SakuraMobileMedia.recognitionProbeResult(" +
                JSONObject.quote(requestId) + "," +
                "{\"ok\":" + ok +
                ",\"error\":" + JSONObject.quote(ok ? "" : message) +
                ",\"message\":" + JSONObject.quote(message) +
                ",\"code\":" + JSONObject.quote(code) +
                ",\"engine\":\"Vosk\"" +
                ",\"model\":\"vosk-model-small-ja-0.22\"" +
                ",\"nativeRecording\":true});"
        );
    }

    private void notifyTtsStarted(String requestId) {
        postJavascript(
            "window.SakuraMobileMedia&&window.SakuraMobileMedia.ttsStarted(" +
                JSONObject.quote(requestId) + ");"
        );
    }

    private void notifyTtsCompleted(String requestId) {
        postJavascript(
            "window.SakuraMobileMedia&&window.SakuraMobileMedia.ttsCompleted(" +
                JSONObject.quote(requestId) + ");"
        );
    }

    private void notifyTtsError(
        String requestId,
        String message,
        String code
    ) {
        postJavascript(
            "window.SakuraMobileMedia&&window.SakuraMobileMedia.ttsError(" +
                JSONObject.quote(requestId) + "," +
                JSONObject.quote(message) + "," +
                JSONObject.quote(code) + ");"
        );
    }

    private void postJavascript(String script) {
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private static final class PcmAudio {
        final byte[] samples;
        final int sampleRate;
        final int channels;
        final int bitsPerSample;

        PcmAudio(
            byte[] samples,
            int sampleRate,
            int channels,
            int bitsPerSample
        ) {
            this.samples = samples;
            this.sampleRate = sampleRate;
            this.channels = channels;
            this.bitsPerSample = bitsPerSample;
        }
    }
}
