const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  session,
  shell,
  WebContentsView,
} = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');
const { readSaveFile, writeSaveFile } = require('./save-format');

const APP_DISPLAY_NAME = 'Sakura';
// Keep the original userData directory so existing progress and B站 cookies remain available.
const LEGACY_DATA_NAME = 'Nihongo Journey';
const execFileAsync = promisify(execFile);
app.setName(APP_DISPLAY_NAME);
app.setPath('userData', path.join(app.getPath('appData'), LEGACY_DATA_NAME));
app.setAppUserModelId('com.nihongojourney.desktop');

let mainWindow = null;
let saveQueue = Promise.resolve();
let courseView = null;
let courseAttached = false;
let courseLoadError = '';

const COURSE_HOME_URL = 'https://www.bilibili.com/';
const COURSE_SEARCH_URL = 'https://search.bilibili.com/all';
const COURSE_PARTITION = 'persist:nihongo-bilibili';
const COURSE_HOST_SUFFIXES = ['bilibili.com', 'bilibili.tv', 'b23.tv'];
const COURSE_LOCAL_EXTENSIONS = new Set([
  '.mp4',
  '.webm',
  '.mkv',
  '.mov',
  '.avi',
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.flac',
  '.pdf',
]);
const TRANSLATION_MAX_CHARS = 5000;
const TRANSLATION_CHUNK_CHARS = 450;
const translationCache = new Map();

function decodeTranslationEntities(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function splitTranslationText(value, maxLength = TRANSLATION_CHUNK_CHARS) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  if (text.length <= maxLength) return [text];
  const segments =
    text.match(/[^\n。！？!?；;]+[。！？!?；;]?|\n+/g) || [text];
  const chunks = [];
  let current = '';
  const pushCurrent = () => {
    if (current.trim()) chunks.push(current);
    current = '';
  };
  for (const segment of segments) {
    if (segment.length > maxLength) {
      pushCurrent();
      for (let index = 0; index < segment.length; index += maxLength) {
        chunks.push(segment.slice(index, index + maxLength));
      }
      continue;
    }
    if ((current + segment).length > maxLength) pushCurrent();
    current += segment;
  }
  pushCurrent();
  return chunks;
}

async function translateChunk(text, direction) {
  const langpair = direction === 'zh-ja' ? 'zh-CN|ja' : 'ja|zh-CN';
  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', text);
  url.searchParams.set('langpair', langpair);
  const response = await net.fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': `Sakura/${app.getVersion()}`,
    },
  });
  if (!response.ok) {
    throw new Error(`翻译服务返回 HTTP ${response.status}`);
  }
  const data = await response.json();
  const translated = decodeTranslationEntities(data?.responseData?.translatedText);
  if (!translated || Number(data?.responseStatus) >= 400) {
    throw new Error(
      decodeTranslationEntities(data?.responseDetails) ||
        '翻译服务没有返回有效译文',
    );
  }
  return translated;
}

async function translateText(text, direction) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) throw new Error('请输入需要翻译的内容');
  if (normalized.length > TRANSLATION_MAX_CHARS) {
    throw new Error(`单次翻译最多 ${TRANSLATION_MAX_CHARS} 个字符`);
  }
  if (!['ja-zh', 'zh-ja'].includes(direction)) {
    throw new Error('翻译方向无效');
  }
  const cacheKey = `${direction}:${normalized}`;
  if (translationCache.has(cacheKey)) {
    return { ...translationCache.get(cacheKey), cached: true };
  }
  const chunks = splitTranslationText(normalized);
  const translatedChunks = [];
  for (const chunk of chunks) {
    translatedChunks.push(await translateChunk(chunk, direction));
  }
  const result = {
    ok: true,
    text: translatedChunks.join(''),
    provider: 'MyMemory',
    providerUrl: 'https://mymemory.translated.net/',
    direction,
    cached: false,
  };
  translationCache.set(cacheKey, result);
  while (translationCache.size > 20) {
    translationCache.delete(translationCache.keys().next().value);
  }
  return result;
}

function stateFile() {
  return path.join(app.getPath('userData'), 'learning-state.json');
}

function exportDirectory() {
  return path.join(app.getPath('documents'), 'Nihongo Journey 存档');
}

function saveTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
    String(date.getMilliseconds()).padStart(3, '0'),
  ].join('-');
}

function isAllowedCourseUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return COURSE_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

function normalizeCourseUrl(value, fallback = COURSE_HOME_URL) {
  return isAllowedCourseUrl(value) ? String(value) : fallback;
}

function normalizeLocalCoursePath(value) {
  const source = String(value || '').trim();
  if (!source || source.includes('\0')) {
    throw new Error('本地课程路径无效');
  }
  const resolved = path.resolve(source);
  if (!path.isAbsolute(resolved)) {
    throw new Error('本地课程必须使用完整路径');
  }
  return resolved;
}

async function inspectLocalCourseFile(filePath) {
  const resolved = normalizeLocalCoursePath(filePath);
  const extension = path.extname(resolved).toLowerCase();
  if (!COURSE_LOCAL_EXTENSIONS.has(extension)) {
    throw new Error('不支持的本地课程格式');
  }
  const stat = await fs.promises.stat(resolved);
  if (!stat.isFile()) throw new Error('所选路径不是文件');
  if (stat.size <= 0) throw new Error('本地课程文件为空');
  return {
    path: resolved,
    name: path.basename(resolved, extension),
    fileName: path.basename(resolved),
    extension: extension.slice(1),
    size: stat.size,
    modifiedAt: stat.mtimeMs,
  };
}

function courseSearchUrl(query) {
  const keyword = String(query || '').trim().slice(0, 120);
  if (!keyword) return COURSE_HOME_URL;
  const url = new URL(COURSE_SEARCH_URL);
  url.searchParams.set('keyword', keyword);
  return url.toString();
}

function sanitizeCourseBounds(bounds) {
  if (!mainWindow || mainWindow.isDestroyed?.()) {
    throw new Error('主窗口不可用');
  }
  const [contentWidth, contentHeight] = mainWindow.getContentSize();
  const values = [
    Number(bounds?.x),
    Number(bounds?.y),
    Number(bounds?.width),
    Number(bounds?.height),
  ];
  if (!values.every(Number.isFinite)) throw new Error('网课窗口区域无效');
  const x = Math.max(0, Math.min(contentWidth - 80, Math.round(values[0])));
  const y = Math.max(0, Math.min(contentHeight - 80, Math.round(values[1])));
  return {
    x,
    y,
    width: Math.max(80, Math.min(contentWidth - x, Math.round(values[2]))),
    height: Math.max(80, Math.min(contentHeight - y, Math.round(values[3]))),
  };
}

function requireMainWindowSender(event) {
  if (!event || !mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error('拒绝非主窗口的网课请求');
  }
}

function courseSnapshot(extra = {}) {
  const webContents =
    courseView && !courseView.webContents.isDestroyed()
      ? courseView.webContents
      : null;
  const history = webContents?.navigationHistory;
  return {
    ok: Boolean(webContents),
    attached: courseAttached,
    url: webContents?.getURL() || '',
    title: webContents?.getTitle() || '',
    loading: Boolean(webContents?.isLoading()),
    canGoBack: Boolean(history?.canGoBack()),
    canGoForward: Boolean(history?.canGoForward()),
    error: courseLoadError,
    ...extra,
  };
}

function sendCourseState(extra = {}) {
  if (!mainWindow || mainWindow.isDestroyed?.()) return;
  if (mainWindow.webContents.isDestroyed?.()) return;
  mainWindow.webContents.send('course:state', courseSnapshot(extra));
}

function openCourseUrl(url) {
  if (!courseView) throw new Error('网课浏览器尚未初始化');
  const target = normalizeCourseUrl(url);
  courseLoadError = '';
  courseView.webContents.loadURL(target).catch((error) => {
    courseLoadError = String(error?.message || error);
    sendCourseState({ event: 'load-error' });
  });
}

function ensureCourseView() {
  if (courseView && !courseView.webContents.isDestroyed()) return courseView;

  const courseSession = session.fromPartition(COURSE_PARTITION);
  courseSession.setPermissionCheckHandler(() => false);
  courseSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  courseSession.on('will-download', (event) => {
    event.preventDefault();
  });

  courseView = new WebContentsView({
    webPreferences: {
      partition: COURSE_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  courseView.setBackgroundColor('#ffffff');
  const webContents = courseView.webContents;
  webContents.setUserAgent(
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`,
  );

  webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedCourseUrl(url)) {
      webContents.loadURL(url).catch(() => {});
    } else if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });
  webContents.on('will-navigate', (event, url) => {
    if (isAllowedCourseUrl(url)) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
  });
  webContents.on('did-start-loading', () => {
    courseLoadError = '';
    sendCourseState({ event: 'start-loading' });
  });
  webContents.on('did-stop-loading', () => {
    sendCourseState({ event: 'stop-loading' });
  });
  webContents.on('did-finish-load', () => {
    sendCourseState({ event: 'finish-load' });
  });
  webContents.on('did-navigate', (_event, url) => {
    sendCourseState({ event: 'navigate', url });
  });
  webContents.on('did-navigate-in-page', (_event, url) => {
    sendCourseState({ event: 'navigate-in-page', url });
  });
  webContents.on('page-title-updated', (_event, title) => {
    sendCourseState({ event: 'title-updated', title });
  });
  webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return;
      courseLoadError = `${errorDescription || '页面加载失败'} (${errorCode})`;
      sendCourseState({
        event: 'load-error',
        url: validatedURL || '',
        error: courseLoadError,
      });
    },
  );
  webContents.on('render-process-gone', (_event, details) => {
    courseLoadError = `网课页面进程已退出：${details?.reason || '未知原因'}`;
    sendCourseState({ event: 'render-process-gone' });
  });
  webContents.on('destroyed', () => {
    courseView = null;
    courseAttached = false;
  });
  return courseView;
}

function attachCourseView(bounds) {
  if (!mainWindow || mainWindow.isDestroyed?.()) {
    throw new Error('主窗口不可用');
  }
  const view = ensureCourseView();
  view.setBounds(sanitizeCourseBounds(bounds));
  if (!courseAttached) {
    mainWindow.contentView.addChildView(view);
    courseAttached = true;
  }
}

function detachCourseView() {
  if (courseAttached && courseView && mainWindow && !mainWindow.isDestroyed?.()) {
    mainWindow.contentView.removeChildView(courseView);
  }
  courseAttached = false;
}

async function captureCoursePlaybackPosition() {
  if (!courseView || courseView.webContents.isDestroyed()) {
    throw new Error('网课浏览器尚未初始化');
  }
  const webContents = courseView.webContents;
  const url = webContents.getURL();
  if (!isAllowedCourseUrl(url)) {
    return { ok: false, error: '请先打开 B站课程视频页面' };
  }
  const result = await webContents.executeJavaScript(`
    (() => {
      const videos = Array.from(document.querySelectorAll('video'))
        .filter((video) =>
          Number.isFinite(video.currentTime) &&
          video.currentTime > 0,
        )
        .sort(
          (left, right) =>
            Number(right.duration || 0) - Number(left.duration || 0),
        );
      const video = videos[0] || null;
      return {
        seconds: video ? Math.round(video.currentTime || 0) : 0,
        duration: video
          ? Math.round(
              Number.isFinite(video.duration)
                ? Math.max(0, video.duration)
                : 0,
            )
          : 0,
        title: document.title || '',
        url: location.href,
      };
    })()
  `);
  const seconds = Math.max(0, Math.min(86400, Number(result?.seconds) || 0));
  const duration = Math.max(
    0,
    Math.min(86400, Number(result?.duration) || 0),
  );
  return {
    ok: seconds > 0,
    error: seconds > 0 ? '' : '播放器还没有可记录的学习位置',
    url: isAllowedCourseUrl(result?.url) ? result.url : url,
    title: String(result?.title || webContents.getTitle() || '').slice(0, 240),
    position: { seconds, duration },
  };
}

function asrPaths() {
  const root = path.join(__dirname, 'asr');
  return {
    python: path.join(root, 'python', 'python.exe'),
    script: path.join(root, 'vosk-recognize.py'),
    model: path.join(root, 'model'),
    lib: path.join(root, 'lib'),
  };
}

function readState() {
  const file = stateFile();
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error('读取学习数据失败:', error);
    const backup = `${file}.bak`;
    try {
      if (fs.existsSync(backup)) return JSON.parse(fs.readFileSync(backup, 'utf8'));
    } catch (backupError) {
      console.error('读取备份失败:', backupError);
    }
    return { __readError: String(error && error.message ? error.message : error) };
  }
}

function writeState(data) {
  const operation = saveQueue.then(async () => {
    const file = stateFile();
    const dir = path.dirname(file);
    await fs.promises.mkdir(dir, { recursive: true });
    const temp = `${file}.tmp`;
    const backup = `${file}.bak`;
    const payload = JSON.stringify(data, null, 2);
    await fs.promises.writeFile(temp, payload, 'utf8');
    if (fs.existsSync(file)) {
      await fs.promises.copyFile(file, backup);
    }
    await fs.promises.rename(temp, file);
  });
  // Keep the queue usable after a failed write while still reporting the
  // failure to the caller that requested this particular save.
  saveQueue = operation.catch(() => {});
  return operation;
}

function showSaveDialog(options) {
  return mainWindow
    ? dialog.showSaveDialog(mainWindow, options)
    : dialog.showSaveDialog(options);
}

function showOpenDialog(options) {
  return mainWindow
    ? dialog.showOpenDialog(mainWindow, options)
    : dialog.showOpenDialog(options);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: APP_DISPLAY_NAME,
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#f5f3ee',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.on('closed', () => {
    if (courseAttached) detachCourseView();
    if (courseView && !courseView.webContents.isDestroyed()) {
      courseView.webContents.close();
    }
    courseView = null;
    courseAttached = false;
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, _origin, details) =>
      permission === 'speaker-selection' ||
      (permission === 'media' &&
        (details?.mediaType === 'audio' || details?.mediaType === 'unknown')),
  );
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      const mediaTypes = Array.isArray(details?.mediaTypes) ? details.mediaTypes : [];
      const audioOnly =
        mediaTypes.length === 0 ||
        (mediaTypes.includes('audio') && !mediaTypes.includes('video'));
      callback(
        (permission === 'media' && audioOnly) ||
          permission === 'speaker-selection',
      );
    },
  );

  ipcMain.handle('state:load', () => readState());
  ipcMain.handle('state:save', async (_event, data) => {
    if (!data || typeof data !== 'object') throw new Error('无效的学习数据');
    await writeState(data);
    return { ok: true };
  });
  ipcMain.handle('state:export', async (_event, data) => {
    if (!data || typeof data !== 'object') throw new Error('无效的学习数据');
    const stamp = new Date().toISOString().slice(0, 10);
    const result = await showSaveDialog({
      title: '导出学习存档',
      defaultPath: path.join(
        app.getPath('documents'),
        `Sakura-save-${stamp}.json`,
      ),
      filters: [{ name: 'Sakura 学习存档', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    await writeSaveFile(result.filePath, data);
    return { ok: true, filePath: result.filePath };
  });
  ipcMain.handle('state:export-auto', async (_event, data) => {
    if (!data || typeof data !== 'object') throw new Error('无效的学习数据');
    const directory = exportDirectory();
    await fs.promises.mkdir(directory, { recursive: true });
    const fileName = `Sakura-save-${saveTimestamp()}.json`;
    const filePath = path.join(directory, fileName);
    await writeSaveFile(filePath, data);
    return { ok: true, filePath, fileName };
  });
  ipcMain.handle('state:import-latest', async () => {
    const directory = exportDirectory();
    if (!fs.existsSync(directory)) {
      return { ok: false, error: '还没有一键导出的存档' };
    }
    const names = (await fs.promises.readdir(directory)).filter((name) =>
      name.toLowerCase().endsWith('.json'),
    );
    const files = await Promise.all(
      names.map(async (name) => {
        const filePath = path.join(directory, name);
        const stat = await fs.promises.stat(filePath);
        return { filePath, fileName: name, mtimeMs: stat.mtimeMs };
      }),
    );
    files.sort((left, right) => right.mtimeMs - left.mtimeMs);
    for (const file of files) {
      try {
        const parsed = await readSaveFile(file.filePath);
        return {
          ok: true,
          state: parsed.state,
          exportedAt: parsed.exportedAt,
          filePath: file.filePath,
          fileName: file.fileName,
        };
      } catch {
        // Try the next save if the newest file is not a valid archive.
      }
    }
    return { ok: false, error: '导出文件夹里没有可读取的存档' };
  });
  ipcMain.handle('state:import', async () => {
    const result = await showOpenDialog({
      title: '导入学习存档',
      properties: ['openFile'],
      filters: [{ name: 'Sakura 学习存档', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
    const filePath = result.filePaths[0];
    const parsed = await readSaveFile(filePath);
    return {
      ok: true,
      state: parsed.state,
      exportedAt: parsed.exportedAt,
      filePath,
    };
  });
  ipcMain.handle('speech:recognize', async (_event, audio) => {
    if (!audio || typeof audio.byteLength !== 'number') {
      throw new Error('无效的录音数据');
    }
    if (audio.byteLength < 44 || audio.byteLength > 5 * 1024 * 1024) {
      throw new Error('录音数据大小异常');
    }

    const wavePath = path.join(
      os.tmpdir(),
      `nihongo-shadow-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`,
    );
    await fs.promises.writeFile(wavePath, Buffer.from(audio));
    try {
      const asr = asrPaths();
      const result = await execFileAsync(
        asr.python,
        [
          asr.script,
          '--wave',
          wavePath,
          '--model',
          asr.model,
          '--lib',
          asr.lib,
        ],
        {
          windowsHide: true,
          timeout: 30000,
          maxBuffer: 1024 * 1024,
          encoding: 'utf8',
        },
      );
      const parsed = JSON.parse(String(result.stdout || '').trim());
      return parsed;
    } finally {
      await fs.promises.unlink(wavePath).catch(() => {});
    }
  });
  ipcMain.handle('translation:translate', async (event, payload = {}) => {
    requireMainWindowSender(event);
    return translateText(payload.text, payload.direction);
  });
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    dataPath: stateFile(),
  }));
  ipcMain.handle('audio:read-asset', async (_event, fileName) => {
    if (
      typeof fileName !== 'string' ||
      fileName !== path.basename(fileName) ||
      !/^[a-z0-9._-]+\.(?:mp3|wav)$/i.test(fileName)
    ) {
      throw new Error('无效的音频资源名称');
    }
    const audioRoot = path.join(__dirname, 'src', 'audio');
    const filePath = path.join(audioRoot, fileName);
    if (!fs.existsSync(filePath)) throw new Error('标准音频不存在');
    return fs.promises.readFile(filePath);
  });
  ipcMain.handle('app:open-data-folder', async () => {
    const file = stateFile();
    if (fs.existsSync(file)) {
      shell.showItemInFolder(file);
      return { ok: true };
    }
    const error = await shell.openPath(path.dirname(file));
    return { ok: !error, error };
  });
  ipcMain.handle('app:open-language-settings', () => {
    if (process.platform !== 'win32') return { ok: false };
    return shell
      .openExternal('ms-settings:regionlanguage')
      .then(() => ({ ok: true }))
      .catch((error) => ({ ok: false, error: String(error) }));
  });
  ipcMain.handle('app:open-sound-settings', () => {
    if (process.platform !== 'win32') return { ok: false };
    return shell
      .openExternal('ms-settings:sound')
      .then(() => ({ ok: true }))
      .catch((error) => ({ ok: false, error: String(error) }));
  });
  ipcMain.handle('course:show', (event, payload = {}) => {
    requireMainWindowSender(event);
    attachCourseView(payload.bounds);
    const webContents = courseView.webContents;
    if (payload.forceLoad || !webContents.getURL()) {
      openCourseUrl(payload.url || COURSE_HOME_URL);
    }
    return courseSnapshot({ event: 'shown' });
  });
  ipcMain.handle('course:set-bounds', (event, bounds) => {
    requireMainWindowSender(event);
    if (!courseView) return { ok: false, error: '网课浏览器尚未初始化' };
    courseView.setBounds(sanitizeCourseBounds(bounds));
    return { ok: true };
  });
  ipcMain.handle('course:hide', (event) => {
    requireMainWindowSender(event);
    detachCourseView();
    return { ok: true };
  });
  ipcMain.handle('course:navigate', (event, url) => {
    requireMainWindowSender(event);
    const target = normalizeCourseUrl(url);
    if (!courseView) throw new Error('网课浏览器尚未初始化');
    openCourseUrl(target);
    return courseSnapshot({ event: 'navigate-requested' });
  });
  ipcMain.handle('course:search', (event, query) => {
    requireMainWindowSender(event);
    if (!courseView) throw new Error('网课浏览器尚未初始化');
    openCourseUrl(courseSearchUrl(query));
    return courseSnapshot({ event: 'search-requested' });
  });
  ipcMain.handle('course:control', (event, action) => {
    requireMainWindowSender(event);
    if (!courseView) throw new Error('网课浏览器尚未初始化');
    const webContents = courseView.webContents;
    const history = webContents.navigationHistory;
    if (action === 'back' && history.canGoBack()) history.goBack();
    else if (action === 'forward' && history.canGoForward()) history.goForward();
    else if (action === 'reload') webContents.reload();
    else if (action === 'stop') webContents.stop();
    else if (action === 'home') openCourseUrl(COURSE_HOME_URL);
    return courseSnapshot({ event: 'control', action });
  });
  ipcMain.handle('course:get-state', (event) => {
    requireMainWindowSender(event);
    return courseSnapshot({ event: 'state' });
  });
  ipcMain.handle('course:capture-position', async (event) => {
    requireMainWindowSender(event);
    return captureCoursePlaybackPosition();
  });
  ipcMain.handle('course:choose-local-files', async (event) => {
    requireMainWindowSender(event);
    const result = await showOpenDialog({
      title: '导入本地网课资源',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: '视频、音频或课程文档',
          extensions: [...COURSE_LOCAL_EXTENSIONS].map((item) => item.slice(1)),
        },
      ],
    });
    if (result.canceled) return { ok: false, canceled: true, files: [] };
    const files = [];
    const errors = [];
    for (const filePath of result.filePaths) {
      try {
        files.push(await inspectLocalCourseFile(filePath));
      } catch (error) {
        errors.push({
          path: String(filePath || ''),
          error: String(error?.message || error),
        });
      }
    }
    return {
      ok: files.length > 0,
      canceled: false,
      files,
      errors,
      error: files.length ? '' : '没有可导入的本地课程文件',
    };
  });
  ipcMain.handle('course:open-local', async (event, filePath) => {
    requireMainWindowSender(event);
    const file = await inspectLocalCourseFile(filePath);
    const error = await shell.openPath(file.path);
    return error
      ? { ok: false, error }
      : { ok: true, path: file.path, name: file.name };
  });
  ipcMain.handle('course:open-external', async (event, url) => {
    requireMainWindowSender(event);
    const currentUrl = courseView?.webContents.getURL();
    const target = normalizeCourseUrl(url || currentUrl);
    if (!isAllowedCourseUrl(target)) {
      return { ok: false, error: '只能使用系统浏览器打开 B站链接' };
    }
    await shell.openExternal(target);
    return { ok: true };
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
