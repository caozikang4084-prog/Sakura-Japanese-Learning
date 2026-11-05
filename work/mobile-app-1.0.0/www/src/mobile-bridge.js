(() => {
  const STORAGE_KEY = 'sakura-mobile-learning-state';
  const VERSION = '1.7.0-mobile';
  const SAVE_APP = 'nihongo-journey';
  const SAVE_FORMAT = 1;
  const MAX_SAVE_BYTES = 10 * 1024 * 1024;
  const translationCache = new Map();
  const pendingSpeechRecognition = new Map();
  const pendingRecognitionProbes = new Map();
  let activeNativeRecording = null;
  let activeNativeTts = null;
  let pendingBackupOperation = null;
  let nativeRequestSequence = 0;

  function nextNativeRequestId(prefix) {
    nativeRequestSequence += 1;
    return `${prefix}-${Date.now()}-${nativeRequestSequence}`;
  }

  function arrayBufferToBase64(value) {
    const bytes =
      value instanceof Uint8Array
        ? value
        : new Uint8Array(
            value instanceof ArrayBuffer
              ? value
              : value.buffer.slice(
                  value.byteOffset,
                  value.byteOffset + value.byteLength,
                ),
          );
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(
        ...bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)),
      );
    }
    return btoa(binary);
  }

  function base64ToArrayBuffer(value) {
    const binary = atob(String(value || ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }

  function parseNativeJson(value) {
    if (!value) return null;
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return null;
    }
  }

  function backupTimestamp(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
      String(date.getMilliseconds()).padStart(3, '0'),
    ].join('-');
  }

  function looksLikeState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return [
      'kana',
      'words',
      'grammar',
      'quizzes',
      'activity',
      'stats',
      'streak',
      'practiceSessions',
      'studyPlan',
      'webCourses',
      'mobileCourses',
    ].some((key) => key in value);
  }

  function parseLearningBackup(raw) {
    let data;
    try {
      data = JSON.parse(String(raw || ''));
    } catch {
      throw new Error('文件不是有效的 JSON 备份');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('备份内容必须是一个 JSON 对象');
    }
    if (data.app !== undefined && data.app !== SAVE_APP) {
      throw new Error('不是 Sakura / 日语次元学习备份');
    }
    if (data.format !== undefined && Number(data.format) !== SAVE_FORMAT) {
      throw new Error(`暂不支持备份格式版本 ${String(data.format)}`);
    }
    const stateValue =
      data.state && typeof data.state === 'object' && !Array.isArray(data.state)
        ? data.state
        : data;
    if (!looksLikeState(stateValue)) {
      throw new Error('备份中没有可识别的学习数据');
    }
    return {
      state: stateValue,
      exportedAt:
        typeof data.exportedAt === 'string' ? data.exportedAt : null,
      app: data.app || '',
      format: data.format === undefined ? null : Number(data.format),
    };
  }

  function runBackupOperation(kind, starter) {
    if (pendingBackupOperation) {
      return Promise.resolve({
        ok: false,
        error: '另一个备份操作尚未结束',
      });
    }
    return new Promise((resolve) => {
      pendingBackupOperation = { kind, resolve };
      try {
        starter();
      } catch (error) {
        pendingBackupOperation = null;
        resolve({
          ok: false,
          error: error?.message || '无法打开 Android 文件界面',
        });
      }
    });
  }

  function finishBackupOperation(kind, result) {
    if (!pendingBackupOperation || pendingBackupOperation.kind !== kind) return;
    const pending = pendingBackupOperation;
    pendingBackupOperation = null;
    pending.resolve(result || { ok: false, error: '备份操作失败' });
  }

  window.SakuraMobileBackup = {
    exportFinished(result) {
      finishBackupOperation('export', result);
    },
    localExportFinished(result) {
      finishBackupOperation('local-export', result);
    },
    importFinished(result) {
      finishBackupOperation('import', result);
    },
    latestImportFinished(result) {
      finishBackupOperation('local-import', result);
    },
  };

  function decodeEntities(value) {
    const text = String(value || '');
    if (!text) return '';
    const area = document.createElement('textarea');
    area.innerHTML = text;
    return area.value;
  }

  function splitText(text, limit = 450) {
    const source = String(text || '').trim();
    if (source.length <= limit) return [source];
    const chunks = [];
    let rest = source;
    while (rest.length > limit) {
      let cut = -1;
      for (let index = limit; index >= Math.max(1, limit - 120); index -= 1) {
        if (/[。！？!?；;\n]/.test(rest[index - 1])) {
          cut = index;
          break;
        }
      }
      if (cut < 0) cut = limit;
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
    if (rest) chunks.push(rest);
    return chunks;
  }

  async function fetchTranslationChunk(text, direction) {
    const langpair = direction === 'zh-ja' ? 'zh-CN|ja' : 'ja|zh-CN';
    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', text);
    url.searchParams.set('langpair', langpair);
    let payload;
    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      payload = await response.json();
    } catch (error) {
      if (!window.SakuraNative?.httpGet) throw error;
      payload = JSON.parse(window.SakuraNative.httpGet(url.toString()));
    }
    const translated = decodeEntities(payload?.responseData?.translatedText);
    if (!translated || Number(payload?.responseStatus) >= 400) {
      throw new Error(
        decodeEntities(payload?.responseDetails) ||
          '翻译服务没有返回有效译文',
      );
    }
    return translated;
  }

  async function translateText(payload = {}) {
    const text = String(payload.text || '').replace(/\r\n/g, '\n').trim();
    const direction = payload.direction === 'zh-ja' ? 'zh-ja' : 'ja-zh';
    if (!text) throw new Error('请输入需要翻译的内容');
    if (text.length > 5000) throw new Error('单次翻译最多 5000 个字符');
    const cacheKey = `${direction}:${text}`;
    if (translationCache.has(cacheKey)) {
      return { ...translationCache.get(cacheKey), cached: true };
    }
    const translated = [];
    for (const chunk of splitText(text)) {
      translated.push(await fetchTranslationChunk(chunk, direction));
    }
    const result = {
      ok: true,
      text: translated.join(''),
      provider: 'MyMemory',
      providerUrl: 'https://mymemory.translated.net/',
      direction,
      cached: false,
    };
    translationCache.set(cacheKey, result);
    return result;
  }

  async function readAudioAsset(fileName) {
    const safeName = String(fileName || '');
    if (!/^[a-z0-9._-]+\.(?:mp3|wav)$/i.test(safeName)) {
      throw new Error('无效的音频资源名称');
    }
    const response = await fetch(`./audio/${encodeURIComponent(safeName)}`);
    if (!response.ok) throw new Error('标准音频不存在');
    return response.arrayBuffer();
  }

  function learningBackupPackage(stateValue) {
    if (!stateValue || typeof stateValue !== 'object') {
      return { error: '当前学习数据不能导出' };
    }
    const exportedAt = new Date();
    const payload = {
      app: SAVE_APP,
      format: SAVE_FORMAT,
      exportedAt: exportedAt.toISOString(),
      state: stateValue,
    };
    const json = JSON.stringify(payload, null, 2);
    if (new Blob([json], { type: 'application/json' }).size > MAX_SAVE_BYTES) {
      return { error: '学习数据超过 10 MB，无法导出' };
    }
    const fileName = `Sakura-save-${backupTimestamp(exportedAt)}.json`;
    return { payload, json, fileName };
  }

  async function exportLearningBackup(stateValue) {
    const backup = learningBackupPackage(stateValue);
    if (backup.error) return { ok: false, error: backup.error };
    const native = window.SakuraNative;
    if (typeof native?.exportLearningBackup !== 'function') {
      return { ok: false, error: '当前安装包没有 Android 文件导出能力' };
    }
    return runBackupOperation('export', () => {
      native.exportLearningBackup(backup.json, backup.fileName);
    });
  }

  async function createLocalLearningBackup(stateValue) {
    const backup = learningBackupPackage(stateValue);
    if (backup.error) return { ok: false, error: backup.error };
    const native = window.SakuraNative;
    if (typeof native?.createLocalLearningBackup !== 'function') {
      return { ok: false, error: '当前安装包没有应用内自动备份能力' };
    }
    return runBackupOperation('local-export', () => {
      native.createLocalLearningBackup(backup.json, backup.fileName);
    });
  }

  function normalizeImportedBackup(picked) {
    try {
      const parsed = parseLearningBackup(picked.text);
      return {
        ok: true,
        state: parsed.state,
        exportedAt: parsed.exportedAt,
        app: parsed.app,
        format: parsed.format,
        fileName: picked.fileName || 'Sakura-save.json',
        bytes: Number(picked.bytes) || 0,
        modifiedAt: Number(picked.modifiedAt) || 0,
        skipped: Number(picked.skipped) || 0,
      };
    } catch (error) {
      return {
        ok: false,
        error: `备份校验失败：${error?.message || '文件内容无法识别'}`,
      };
    }
  }

  async function importLearningBackup() {
    const native = window.SakuraNative;
    if (typeof native?.importLearningBackup !== 'function') {
      return { ok: false, error: '当前安装包没有 Android 文件导入能力' };
    }
    const picked = await runBackupOperation('import', () => {
      native.importLearningBackup();
    });
    if (!picked?.ok) return picked;
    return normalizeImportedBackup(picked);
  }

  async function importLatestLearningBackup() {
    const native = window.SakuraNative;
    if (typeof native?.readLatestLocalLearningBackup !== 'function') {
      return { ok: false, error: '当前安装包没有最近备份恢复能力' };
    }
    const picked = await runBackupOperation('local-import', () => {
      native.readLatestLocalLearningBackup();
    });
    if (!picked?.ok) return picked;
    return normalizeImportedBackup(picked);
  }

  async function recognizeSpeech(wav) {
    const native = window.SakuraNative;
    if (typeof native?.startRecognizeWav !== 'function') {
      return {
        ok: false,
        error: '当前 Android 安装包没有可用的离线日语识别引擎',
      };
    }
    let wavBase64;
    try {
      wavBase64 = arrayBufferToBase64(wav);
    } catch {
      return {
        ok: false,
        error: '录音数据无法转换为识别格式',
      };
    }
    const requestId = nextNativeRequestId('speech');
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingSpeechRecognition.delete(requestId);
        resolve({
          ok: false,
          error: '本地日语识别超时，请重新录音后重试',
        });
      }, 90000);
      pendingSpeechRecognition.set(requestId, {
        resolve,
        reject(error, code = '') {
          resolve({ ok: false, error, code });
        },
        timer,
      });
      try {
        native.startRecognizeWav(requestId, wavBase64);
      } catch (error) {
        clearTimeout(timer);
        pendingSpeechRecognition.delete(requestId);
        resolve({
          ok: false,
          error: error?.message || '无法启动本地日语识别',
        });
      }
    });
  }

  async function probeSpeechRecognition() {
    const native = window.SakuraNative;
    if (typeof native?.probeSpeechRecognition !== 'function') {
      return {
        ok: false,
        error: '当前 Android 安装包没有离线识别探测接口',
        code: 'probe-unavailable',
      };
    }
    const requestId = nextNativeRequestId('probe');
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingRecognitionProbes.delete(requestId);
        resolve({
          ok: false,
          error: '离线识别模型初始化超时，请重新打开跟读面板重试',
          code: 'model-probe-timeout',
        });
      }, 120000);
      pendingRecognitionProbes.set(requestId, { resolve, timer });
      try {
        native.probeSpeechRecognition(requestId);
      } catch (error) {
        clearTimeout(timer);
        pendingRecognitionProbes.delete(requestId);
        resolve({
          ok: false,
          error: error?.message || '无法探测离线识别模型',
          code: 'probe-failed',
        });
      }
    });
  }

  function startNativeRecording(handlers = {}) {
    const native = window.SakuraNative;
    if (typeof native?.startNativeAudioRecording !== 'function') {
      return Promise.reject(new Error('当前安装包没有原生录音能力'));
    }
    if (activeNativeRecording) {
      return Promise.reject(new Error('上一段录音尚未结束'));
    }
    const requestId = nextNativeRequestId('recording');
    return new Promise((resolve, reject) => {
      activeNativeRecording = {
        id: requestId,
        started: false,
        onLevel: handlers.onLevel,
        resolveStart: resolve,
        rejectStart: reject,
        resolveStop: null,
        rejectStop: null,
      };
      try {
        native.startNativeAudioRecording(requestId);
      } catch (error) {
        activeNativeRecording = null;
        reject(error);
      }
    });
  }

  function stopNativeRecording() {
    if (!activeNativeRecording?.started) {
      return Promise.reject(new Error('当前没有正在进行的录音'));
    }
    return new Promise((resolve, reject) => {
      activeNativeRecording.resolveStop = resolve;
      activeNativeRecording.rejectStop = reject;
      try {
        window.SakuraNative.stopNativeAudioRecording();
      } catch (error) {
        reject(error);
      }
    });
  }

  function cancelNativeRecording() {
    const requestId = activeNativeRecording?.id || '';
    activeNativeRecording = null;
    try {
      window.SakuraNative?.cancelNativeAudioRecording?.(requestId);
    } catch {
      // The Activity may already be shutting down.
    }
  }

  function speakJapaneseText(text, handlers = {}) {
    const value = String(text || '').trim();
    const native = window.SakuraNative;
    if (!value || typeof native?.speakJapaneseText !== 'function') {
      return Promise.resolve({
        ok: false,
        error: value
          ? '当前安装包没有 Android 日语朗读能力'
          : '没有可朗读的日语文本',
      });
    }
    if (activeNativeTts) {
      activeNativeTts.resolve({
        ok: false,
        superseded: true,
        error: '朗读已由新的播放请求替换',
      });
      activeNativeTts = null;
    }
    const requestId = nextNativeRequestId('tts');
    return new Promise((resolve) => {
      activeNativeTts = {
        id: requestId,
        resolve,
        onStart: handlers.onStart,
      };
      try {
        native.speakJapaneseText(requestId, value);
      } catch (error) {
        activeNativeTts = null;
        resolve({
          ok: false,
          error: error?.message || '无法启动 Android 日语朗读',
        });
      }
    });
  }

  function stopNativeSpeech() {
    if (activeNativeTts) {
      activeNativeTts.resolve({
        ok: false,
        canceled: true,
        error: '朗读已停止',
      });
      activeNativeTts = null;
    }
    try {
      window.SakuraNative?.stopJapaneseSpeech?.();
    } catch {
      // Activity may already be shutting down.
    }
  }

  window.SakuraMobileMedia = {
    recordingStarted(requestId, sampleRate) {
      const session = activeNativeRecording;
      if (!session || session.id !== requestId) return;
      session.started = true;
      session.resolveStart({
        ok: true,
        sampleRate: Number(sampleRate) || 0,
      });
    },
    recordingLevel(requestId, level) {
      const session = activeNativeRecording;
      if (!session || session.id !== requestId) return;
      session.onLevel?.(Number(level) || 0);
    },
    recordingStopped(requestId, payload) {
      const session = activeNativeRecording;
      if (!session || session.id !== requestId) return;
      activeNativeRecording = null;
      try {
        const result = {
          ...payload,
          wav: base64ToArrayBuffer(payload?.wavBase64),
        };
        delete result.wavBase64;
        session.resolveStop?.(result);
      } catch (error) {
        session.rejectStop?.(error);
      }
    },
    recordingError(requestId, code, message) {
      const session = activeNativeRecording;
      if (!session || session.id !== requestId) return;
      activeNativeRecording = null;
      const error = new Error(message || '麦克风录音失败');
      error.code = code;
      if (session.started) {
        session.rejectStop?.(error);
      } else {
        session.rejectStart?.(error);
      }
    },
    ttsStarted(requestId) {
      if (!activeNativeTts || activeNativeTts.id !== requestId) return;
      activeNativeTts.started = true;
      activeNativeTts.onStart?.();
    },
    ttsCompleted(requestId) {
      if (!activeNativeTts || activeNativeTts.id !== requestId) return;
      const session = activeNativeTts;
      activeNativeTts = null;
      session.resolve({ ok: true });
    },
    ttsError(requestId, message, code) {
      if (!activeNativeTts || activeNativeTts.id !== requestId) return;
      const session = activeNativeTts;
      activeNativeTts = null;
      session.resolve({
        ok: false,
        error: message || 'Android 日语朗读失败',
        code: code || '',
        canceled: code === 'canceled',
        superseded: code === 'superseded',
      });
    },
    speechResult(requestId, result) {
      const pending = pendingSpeechRecognition.get(requestId);
      if (!pending) return;
      pendingSpeechRecognition.delete(requestId);
      clearTimeout(pending.timer);
      pending.resolve(result);
    },
    speechError(requestId, message, code) {
      const pending = pendingSpeechRecognition.get(requestId);
      if (!pending) return;
      pendingSpeechRecognition.delete(requestId);
      clearTimeout(pending.timer);
      pending.reject(message, code || '');
    },
    recognitionProbeResult(requestId, result) {
      const pending = pendingRecognitionProbes.get(requestId);
      if (!pending) return;
      pendingRecognitionProbes.delete(requestId);
      clearTimeout(pending.timer);
      pending.resolve(result || {
        ok: false,
        error: '离线识别模型探测没有返回结果',
      });
    },
  };

  window.journey = {
    async loadState() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return { __readError: true };
      }
    },
    async saveState(stateValue) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateValue));
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error?.message || '本地保存失败' };
      }
    },
    exportSave: exportLearningBackup,
    exportSaveAuto: createLocalLearningBackup,
    importLatest: importLatestLearningBackup,
    importSave: importLearningBackup,
    getLocalBackupInfo() {
      return (
        parseNativeJson(
          window.SakuraNative?.getLocalLearningBackupInfo?.(),
        ) || {
          ok: false,
          error: '当前安装包没有本地备份信息接口',
        }
      );
    },
    translateText,
    recognizeSpeech,
    probeSpeechRecognition,
    readAudioAsset,
    hasNativeRecording() {
      return typeof window.SakuraNative?.startNativeAudioRecording === 'function';
    },
    startNativeRecording,
    stopNativeRecording,
    cancelNativeRecording,
    speakJapanese: speakJapaneseText,
    stopNativeSpeech,
    hasNativeSpeech() {
      return typeof window.SakuraNative?.speakJapaneseText === 'function';
    },
    getSpeechCapabilities() {
      return (
        parseNativeJson(window.SakuraNative?.getSpeechCapabilities?.()) || {
          ok: false,
          nativeRecording: false,
          recognitionBundled: false,
          recognitionReady: false,
          engine: '',
          model: '',
          offline: true,
        }
      );
    },
    async openMicrophoneSettings() {
      window.SakuraNative?.openAppSettings?.();
      return { ok: true };
    },
    async getAppInfo() {
      return {
        version: VERSION,
        dataPath: '手机应用本地存储',
      };
    },
    async openDataFolder() {
      window.SakuraNative?.showToast?.('手机版数据保存在应用私有目录');
      return { ok: false, error: '手机应用不允许打开内部数据目录' };
    },
    async openLanguageSettings() {
      window.SakuraNative?.openLanguageSettings?.();
      return { ok: true };
    },
    async openSoundSettings() {
      return { ok: false, error: '请在手机系统设置中调整媒体音量' };
    },
    async showCourseBrowser() {
      return { ok: false, error: '手机版已移除网页课程浏览器' };
    },
    async hideCourseBrowser() {
      return { ok: true };
    },
    async navigateCourse() {
      return { ok: false, error: '手机版已移除网页课程浏览器' };
    },
    async searchCourse() {
      return { ok: false, error: '手机版已移除网页课程搜索' };
    },
    async controlCourse() {
      return { ok: false, error: '手机版已移除网页课程播放器' };
    },
    async getCourseState() {
      return { ok: true, url: '', title: '', loading: false, error: '' };
    },
    async captureCoursePosition() {
      return { ok: false, error: '手机版不支持读取网页播放位置' };
    },
    async chooseLocalCourseFiles() {
      return { ok: false, error: '手机首版使用手动课程进度，不导入媒体文件' };
    },
    async openLocalCourseFile() {
      return { ok: false, error: '手机首版不打开本地媒体课程' };
    },
    async openCourseExternal() {
      return { ok: false, error: '手机版已移除网页课程入口' };
    },
    onCourseState() {
      return () => {};
    },
  };
})();
