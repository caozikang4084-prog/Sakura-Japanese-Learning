const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = __dirname;
const bridgeSource = fs.readFileSync(
  path.join(ROOT, 'www', 'src', 'mobile-bridge.js'),
  'utf8',
);
const keepAlive = setTimeout(() => {}, 5000);
const storage = new Map();

global.window = global;
global.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};
global.document = {
  createElement() {
    return { innerHTML: '', value: '' };
  },
};
global.fetch = async () => {
  throw new Error('network disabled');
};
global.btoa = (value) =>
  Buffer.from(String(value), 'binary').toString('base64');
global.atob = (value) =>
  Buffer.from(String(value), 'base64').toString('binary');

vm.runInThisContext(bridgeSource, { filename: 'mobile-bridge.js' });

let recognitionRequest = null;
let modelReady = false;
global.SakuraNative = {
  getSpeechCapabilities() {
    return JSON.stringify({
      ok: true,
      nativeRecording: true,
      recognitionBundled: true,
      recognitionReady: modelReady,
      engine: 'Vosk',
      model: 'vosk-model-small-ja-0.22',
      recognitionOffline: true,
    });
  },
  probeSpeechRecognition(requestId) {
    modelReady = true;
    global.SakuraMobileMedia.recognitionProbeResult(requestId, {
      ok: true,
      engine: 'Vosk',
      model: 'vosk-model-small-ja-0.22',
      nativeRecording: true,
    });
  },
  startRecognizeWav(requestId, wavBase64) {
    recognitionRequest = { requestId, wavBase64 };
    global.SakuraMobileMedia.speechResult(requestId, {
      ok: true,
      text: '学生です',
      words: [{ word: '学生' }, { word: 'です' }],
    });
  },
  startNativeAudioRecording(requestId) {
    global.__activeRecordingRequest = requestId;
    global.SakuraMobileMedia.recordingStarted(requestId, 16000);
    global.SakuraMobileMedia.recordingLevel(requestId, 42);
  },
  stopNativeAudioRecording() {
    global.SakuraMobileMedia.recordingStopped(
      global.__activeRecordingRequest,
      {
        ok: true,
        wavBase64: 'AQID',
        sampleRate: 16000,
        durationSeconds: 1,
      },
    );
  },
  cancelNativeAudioRecording() {},
  speakJapaneseText(requestId, text) {
    global.__spokenText = text;
    global.SakuraMobileMedia.ttsStarted(requestId);
    global.SakuraMobileMedia.ttsCompleted(requestId);
  },
  stopJapaneseSpeech() {},
};

function fail(error) {
  clearTimeout(keepAlive);
  console.error(error);
  process.exitCode = 1;
}

function testRecognitionError() {
  global.SakuraNative.startRecognizeWav = (requestId) => {
    global.SakuraMobileMedia.speechError(
      requestId,
      '没有识别到稳定文本',
      'no-match',
    );
  };
  global.window.journey
    .recognizeSpeech(new Uint8Array([1]).buffer)
    .then((recognitionError) => {
      assert.equal(recognitionError.ok, false);
      assert.match(recognitionError.error, /没有识别/);
      assert.equal(recognitionError.code, 'no-match');
      global.SakuraNative.probeSpeechRecognition = (requestId) => {
        global.SakuraMobileMedia.recognitionProbeResult(requestId, {
          ok: false,
          error: '设备内存不足',
          code: 'out-of-memory',
        });
      };
      return global.window.journey.probeSpeechRecognition();
    })
    .then((probeError) => {
      assert.equal(probeError.ok, false);
      assert.equal(probeError.code, 'out-of-memory');
      testTts();
    })
    .catch(fail);
}

function testTts() {
  assert.equal(global.window.journey.hasNativeSpeech(), true);
  let rapidRequestCount = 0;
  global.SakuraNative.speakJapaneseText = (requestId) => {
    rapidRequestCount += 1;
    if (rapidRequestCount === 2) {
      global.SakuraMobileMedia.ttsStarted(requestId);
      global.SakuraMobileMedia.ttsCompleted(requestId);
    }
  };
  const firstRapidRequest = global.window.journey.speakJapanese('あ');
  const secondRapidRequest = global.window.journey.speakJapanese('い');
  Promise.all([firstRapidRequest, secondRapidRequest]).then(
    ([first, second]) => {
      assert.equal(first.superseded, true);
      assert.equal(second.ok, true);
      global.SakuraNative.speakJapaneseText = (requestId, text) => {
        global.__spokenText = text;
        global.SakuraMobileMedia.ttsStarted(requestId);
        global.SakuraMobileMedia.ttsCompleted(requestId);
      };
      return global.window.journey.speakJapanese('学生です');
    },
  )
    .then((spoken) => {
      assert.equal(spoken.ok, true);
      assert.equal(global.__spokenText, '学生です');
      global.SakuraNative.speakJapaneseText = (requestId) => {
        global.SakuraMobileMedia.ttsError(
          requestId,
          '系统未安装日语语音',
          'tts-japanese-unavailable',
        );
      };
      return global.window.journey.speakJapanese('学生です');
    })
    .then((speechError) => {
      assert.equal(speechError.ok, false);
      assert.equal(speechError.code, 'tts-japanese-unavailable');
      clearTimeout(keepAlive);
      console.log('mobile voice bridge tests passed');
    })
    .catch(fail);
}

function testPermissionError() {
  global.SakuraNative.startNativeAudioRecording = (requestId) => {
    global.SakuraMobileMedia.recordingError(
      requestId,
      'microphone-permission-denied',
      '麦克风权限未授予',
    );
  };
  global.window.journey
    .startNativeRecording()
    .then(() => fail(new Error('permission error should reject')))
    .catch((error) => {
      try {
        assert.equal(error.code, 'microphone-permission-denied');
        testRecognitionError();
      } catch (assertionError) {
        fail(assertionError);
      }
    });
}

function testRecording() {
  let level = -1;
  global.window.journey
    .startNativeRecording({
      onLevel(value) {
        level = value;
      },
    })
    .then((startResult) => {
      assert.equal(startResult.sampleRate, 16000);
      assert.equal(level, 42);
      global.window.journey
        .stopNativeRecording()
        .then((recording) => {
          assert.equal(recording.ok, true);
          assert.equal(recording.sampleRate, 16000);
          assert.deepEqual(
            Array.from(new Uint8Array(recording.wav)),
            [1, 2, 3],
          );
          testPermissionError();
        })
        .catch(fail);
    })
    .catch(fail);
}

const capabilities = global.window.journey.getSpeechCapabilities();
assert.equal(capabilities.recognitionBundled, true);
assert.equal(capabilities.recognitionReady, false);
assert.equal(capabilities.nativeRecording, true);
global.window.journey
  .probeSpeechRecognition()
  .then((probe) => {
    assert.equal(probe.ok, true);
    assert.equal(global.window.journey.getSpeechCapabilities().recognitionReady, true);
    return global.window.journey.recognizeSpeech(
      new Uint8Array([82, 73, 70, 70]).buffer,
    );
  })
  .then((speech) => {
    assert.equal(speech.ok, true);
    assert.equal(speech.text, '学生です');
    assert.equal(recognitionRequest.wavBase64, 'UklGRg==');
    testRecording();
  })
  .catch(fail);
