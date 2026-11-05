const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = __dirname;
const webRoot = path.join(root, 'www', 'src');
const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
const bridge = fs.readFileSync(path.join(webRoot, 'mobile-bridge.js'), 'utf8');
const course = fs.readFileSync(path.join(webRoot, 'mobile-course.js'), 'utf8');
const wordSheet = fs.readFileSync(
  path.join(webRoot, 'mobile-word-sheet.js'),
  'utf8',
);
const voiceBridge = fs.readFileSync(
  path.join(root, 'android', 'src', 'com', 'sakura', 'mobile', 'SpeechCompatibilityBridge.java'),
  'utf8',
);
const backupBridge = fs.readFileSync(
  path.join(root, 'android', 'src', 'com', 'sakura', 'mobile', 'LearningBackupBridge.java'),
  'utf8',
);
const app = fs.readFileSync(path.join(webRoot, 'app.js'), 'utf8');
const mobileCss = fs.readFileSync(
  path.join(webRoot, 'mobile-overrides.css'),
  'utf8',
);
const uiTest = fs.readFileSync(
  path.join(root, 'test-mobile-ui.js'),
  'utf8',
);
const manifestSource = fs.readFileSync(
  path.join(webRoot, 'audio', 'manifest.js'),
  'utf8',
);
const manifestContext = {};
vm.createContext(manifestContext);
vm.runInContext(
  `${manifestSource}\nthis.__manifest = AUDIO_MANIFEST;`,
  manifestContext,
);
const manifest = manifestContext.__manifest;
const files = Object.values(manifest);
const missing = files.filter(
  (fileName) => !fs.existsSync(path.join(webRoot, 'audio', fileName)),
);

assert.match(html, /mobile-bridge\.js/);
assert.match(html, /mobile-course\.js/);
assert.match(html, /mobile-word-sheet\.js/);
assert.ok(
  html.indexOf('mobile-bridge.js') < html.indexOf('app.js'),
  '移动桥必须在 app.js 前加载',
);
assert.ok(
  html.indexOf('app.js') < html.indexOf('mobile-word-sheet.js'),
  '词汇底部面板必须在 app.js 后加载',
);
assert.ok(
  html.indexOf('mobile-word-sheet.js') < html.indexOf('mobile-course.js'),
  '网课覆盖层和词汇底部面板的加载顺序不正确',
);
assert.match(bridge, /localStorage/);
assert.match(bridge, /api\.mymemory\.translated\.net/);
assert.match(bridge, /startRecognizeWav/);
assert.match(bridge, /startNativeAudioRecording/);
assert.match(bridge, /SakuraMobileMedia/);
assert.match(bridge, /SakuraMobileBackup/);
assert.match(bridge, /exportLearningBackup/);
assert.match(bridge, /importLearningBackup/);
assert.match(bridge, /createLocalLearningBackup/);
assert.match(bridge, /readLatestLocalLearningBackup/);
assert.match(bridge, /getLocalLearningBackupInfo/);
assert.match(bridge, /nihongo-journey/);
assert.match(course, /mobile-course-checkin/);
assert.doesNotMatch(course, /bilibili/i);
assert.match(app, /class="mobile-quick-grid"/);
assert.match(app, /pendingImportResult/);
assert.match(app, /data-action="import-confirm"/);
assert.match(app, /确认覆盖当前学习数据/);
assert.equal(
  (app.match(/data-action="navigate" data-route="(?:kana|words|grammar|quiz|translate|courses)"/g) || [])
    .length >= 6,
  true,
);
assert.match(wordSheet, /mobile-word-sheet-modal/);
assert.match(wordSheet, /data-action="word-toggle"/);
assert.match(wordSheet, /data-action="shadow-open"/);
assert.match(wordSheet, /visualViewport/);
assert.match(mobileCss, /\.mobile-quick-grid\s*\{/);
assert.match(mobileCss, /\.word-detail\s*\{\s*display:\s*none;/);
assert.match(mobileCss, /--sakura-visible-height/);
assert.match(mobileCss, /word-spacing:\s*\.14em/);
assert.match(mobileCss, /overflow-wrap:\s*anywhere/);
assert.match(mobileCss, /Mobile V4: consistent readable density/);
assert.match(html, /interactive-widget=resizes-content/);
assert.match(uiTest, /mobile responsive UI tests passed/);
assert.equal(Object.keys(manifest).length, 15918);
assert.equal(files.filter((name) => name.endsWith('.mp3')).length, 15918);
assert.deepEqual(missing, []);

const java = fs.readFileSync(
  path.join(root, 'android', 'src', 'com', 'sakura', 'mobile', 'MainActivity.java'),
  'utf8',
);
const androidManifest = fs.readFileSync(
  path.join(root, 'android', 'AndroidManifest.xml'),
  'utf8',
);
assert.match(java, /RECORD_AUDIO/);
assert.match(java, /android_asset\/www\/src\/index\.html/);
assert.match(java, /SakuraNative/);
assert.match(java, /1\.7\.9-mobile/);
assert.match(androidManifest, /android:versionCode="17009"/);
assert.match(androidManifest, /android:versionName="1\.7\.9"/);
assert.match(androidManifest, /android:windowSoftInputMode="adjustResize"/);
assert.match(androidManifest, /android:name="android.permission.RECORD_AUDIO"/);
assert.match(androidManifest, /android:name="android.hardware.microphone"[^>]*android:required="false"/);
assert.match(androidManifest, /android:extractNativeLibs="true"/);
assert.match(java, /isTrustedWebContent/);
assert.match(java, /currentUrl\.startsWith\("file:\/\/\/android_asset\/www\/"\)/);
assert.match(java, /RESOURCE_AUDIO_CAPTURE/);
assert.doesNotMatch(java, /ACTIVATION_URL|LicenseManager|LicenseBridge|mainAppUnlocked/);
const onCreateBlock = java.slice(
  java.indexOf('protected void onCreate'),
  java.indexOf('private void configureWebView'),
);
assert.doesNotMatch(
  onCreateBlock,
  /requestPermissions/,
  '麦克风权限应在首次录音时请求',
);
assert.match(voiceBridge, /AudioRecord/);
assert.match(voiceBridge, /vosk-model-small-ja-0\.22/);
assert.match(voiceBridge, /recognizer\.getFinalResult/);
assert.match(voiceBridge, /probeRecognition/);
assert.match(voiceBridge, /recognitionReady/);
assert.match(voiceBridge, /recognitionErrorCode/);
assert.match(bridge, /probeSpeechRecognition/);
assert.match(bridge, /recognitionProbeResult/);
assert.match(app, /shadowReferenceAudioFile/);
assert.match(app, /data-shadow-audio-text/);
assert.doesNotMatch(app, /安装日语语音包后，点击假名就会自动朗读/);
assert.match(backupBridge, /ACTION_CREATE_DOCUMENT/);
assert.match(backupBridge, /ACTION_OPEN_DOCUMENT/);
assert.match(backupBridge, /openInputStream/);
assert.match(backupBridge, /openOutputStream/);
assert.match(backupBridge, /MAX_BACKUP_BYTES = 10 \* 1024 \* 1024/);
assert.match(backupBridge, /getExternalFilesDir/);
assert.match(backupBridge, /"Sakura\/Backups"/);
assert.match(backupBridge, /uniqueBackupFile/);
assert.match(backupBridge, /pruneOldBackups/);
assert.match(voiceBridge, /TextToSpeech/);
assert.match(voiceBridge, /Locale\.JAPANESE/);
assert.match(java, /onActivityResult/);
assert.ok(
  fs.existsSync(
    path.join(root, 'android', 'assets', 'vosk-model-small-ja-0.22.zip'),
  ),
);

console.log(
  `mobile tests passed: ${files.length} audio mappings, ${Object.keys(manifest).length} texts`,
);
