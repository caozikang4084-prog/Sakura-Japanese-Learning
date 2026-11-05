const KANA_CELLS = KANA_ROWS.flatMap((row) => row.cells.filter(Boolean));
const KANA_TOTAL = KANA_CELLS.length;
const WORD_TOTAL = CONTENT_WORDS.length;
const GRAMMAR_TOTAL = CONTENT_GRAMMAR.length;
const QUESTIONS_PER_QUIZ = 10;
const WORD_PAGE_SIZE = 50;
const GRAMMAR_PAGE_SIZE = 20;
const WORD_THEME_SHORTCUTS = [
  '饮食',
  '购物',
  '交通出行',
  '时间与日期',
  '人物与家庭',
  '身体与健康',
  '学习与工作',
  '天气与自然',
  '兴趣与媒体',
  '社会与文化',
];
const GRAMMAR_FUNCTION_SHORTCUTS = [
  '句型与连接',
  '条件与假设',
  '程度与比较',
  '转折与让步',
  '时间与期间',
  '限定与强调',
  '可能与能力',
  '原因与理由',
  '动词变化',
  '请求与义务',
  '推测与判断',
  '范围与关联',
];
const SHADOW_READING_LEXICON = Object.fromEntries(
  [
    ...CONTENT_WORDS.map((word) => [word.word, word.kana]),
    ...CONTENT_WORDS.flatMap((word) =>
      word.examples.map((example) => [example.ja, example.reading]),
    ),
    ...CONTENT_GRAMMAR.flatMap((lesson) =>
      lesson.examples.map((example) => [example.ja, example.reading]),
    ),
  ].filter(
    ([surface, reading]) =>
      Boolean(surface && reading) && surface !== reading,
  ),
);
const STUDY_ROUTES = new Set([
  'home',
  'kana',
  'words',
  'grammar',
  'quiz',
  'courses',
  'translate',
]);

const els = {
  nav: document.getElementById('nav'),
  view: document.getElementById('view'),
  pageTitle: document.getElementById('page-title'),
  eyebrow: document.getElementById('top-eyebrow'),
  stagePill: document.getElementById('stage-pill'),
  dateText: document.getElementById('date-text'),
  version: document.getElementById('version-text'),
  saveState: document.getElementById('save-state'),
  saveText: document.getElementById('save-text'),
  dataFolder: document.getElementById('data-folder-button'),
  backdrop: document.getElementById('modal-backdrop'),
  modal: document.getElementById('modal'),
  toast: document.getElementById('toast'),
};

const bridge = window.journey ?? {
  loadState: async () => {
    try {
      return JSON.parse(localStorage.getItem('nihongo-journey-state') || 'null');
    } catch {
      return null;
    }
  },
  saveState: async (data) => {
    localStorage.setItem('nihongo-journey-state', JSON.stringify(data));
    return { ok: true };
  },
  exportSave: async (data) => {
    const payload = {
      app: 'nihongo-journey',
      format: 1,
      exportedAt: new Date().toISOString(),
      state: data,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Sakura-save-${todayKey()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    return { ok: true, filePath: link.download };
  },
  exportSaveAuto: async (data) => {
    const result = await bridge.exportSave(data);
    return { ...result, fileName: result?.filePath || 'Sakura-save.json' };
  },
  importLatest: async () => ({
    ok: false,
    error: '当前环境不支持一键导入，请使用从其他文件导入',
  }),
  translateText: async () => {
    throw new Error('当前运行方式不支持联网翻译');
  },
  recognizeSpeech: async () => ({
    ok: false,
    error: '当前运行方式不支持本地语音识别',
  }),
  readAudioAsset: async () => null,
  importSave: async () =>
    new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) {
          resolve({ ok: false, canceled: true });
          return;
        }
        try {
          const data = JSON.parse(await file.text());
          const imported = data && typeof data.state === 'object' ? data.state : data;
          resolve({
            ok: true,
            state: imported,
            exportedAt: data?.exportedAt ?? null,
            filePath: file.name,
          });
        } catch (error) {
          resolve({ ok: false, error: error.message });
        }
      };
      input.click();
    }),
  getAppInfo: async () => ({ version: '1.0.0', dataPath: '' }),
  openDataFolder: async () => {},
  openLanguageSettings: async () => ({ ok: false }),
  openSoundSettings: async () => ({ ok: false }),
  showCourseBrowser: async () => ({
    ok: false,
    error: '当前运行方式不支持内置网课浏览器，请使用系统浏览器。',
  }),
  setCourseBrowserBounds: async () => ({ ok: false }),
  hideCourseBrowser: async () => ({ ok: false }),
  navigateCourse: async () => ({ ok: false }),
  searchCourse: async () => ({ ok: false }),
  controlCourse: async () => ({ ok: false }),
  getCourseState: async () => ({ ok: false }),
  openCourseExternal: async () => ({ ok: false }),
  captureCoursePosition: async () => ({
    ok: false,
    error: '当前运行方式不支持读取网课播放位置',
  }),
  chooseLocalCourseFiles: async () => ({
    ok: false,
    error: '当前运行方式不支持导入本地课程',
  }),
  openLocalCourseFile: async () => ({
    ok: false,
    error: '当前运行方式不支持打开本地课程',
  }),
  onCourseState: () => () => {},
};

const COURSE_HOME_URL = 'https://www.bilibili.com/';
const COURSE_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1', '未分级'];
const COURSE_STATUSES = ['unstarted', 'learning', 'completed'];
const COURSE_STATUS_LABELS = {
  unstarted: '未学',
  learning: '学习中',
  completed: '已完成',
};
const STUDY_FOUNDATIONS = [
  ['zero', '完全零基础'],
  ['kana', '五十音已掌握'],
  ['N5', 'N5 基础'],
  ['N4', 'N4 基础'],
  ['N3', 'N3 基础'],
  ['N2', 'N2 基础'],
  ['N1', 'N1 基础'],
];
const STUDY_TARGET_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
const STUDY_DAILY_MINUTES = [
  10, 15, 20, 30, 40, 45, 60, 75, 90, 100, 120, 150, 180,
];
const STUDY_WEEKLY_DAYS = [3, 4, 5, 6, 7];
const PRACTICE_GROUP_OPTIONS = [1, 2, 3, 4, 5, 6];
const PRACTICE_QUESTION_OPTIONS = [5, 6, 10, 15, 20];
const MAX_PRACTICE_QUESTION_COUNT = Math.max(...PRACTICE_QUESTION_OPTIONS);
const COURSE_DAILY_TARGETS = [0, 1, 2, 3, 4, 5, 6, 8, 10];
const COURSE_PLAN_MINUTES = [15, 20, 30, 45, 60, 90, 120, 150, 180];
const COURSE_PLAN_INTENSITIES = [
  ['relaxed', '轻松', 0.75],
  ['standard', '标准', 1],
  ['focused', '集中', 1.25],
];
const STUDY_DURATION_UNITS = [
  ['weeks', '周'],
  ['months', '个月'],
];
const STUDY_LEVEL_RANK = {
  zero: 0,
  kana: 0.5,
  N5: 1,
  N4: 2,
  N3: 3,
  N2: 4,
  N1: 5,
};
const STUDY_LEVEL_DIFFICULTY = {
  N5: 1,
  N4: 1.1,
  N3: 1.25,
  N2: 1.4,
  N1: 1.55,
};
const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30, 60];
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

function defaultState() {
  return {
    version: 1,
    startedAt: Date.now(),
    kana: {},
    words: {},
    grammar: {},
    quizzes: [],
    practiceSessions: [],
    translationHistory: [],
    activity: [],
    streak: { last: null, days: 0 },
    stats: { answered: 0, correct: 0 },
    studySecondsByDay: {},
    onboarding: {
      schemaVersion: 1,
      status: 'pending',
      completedAt: 0,
      skippedAt: 0,
      reminderDismissedAt: 0,
    },
    studyPlan: {
      configured: false,
      currentLevel: 'zero',
      targetLevel: 'N5',
      durationValue: 6,
      durationUnit: 'months',
      startedAt: 0,
      targetDate: 0,
      dailyMinutes: 30,
      weeklyStudyDays: 7,
      dailyPracticeGroups: 0,
      practiceQuestionsPerRound: 0,
      dailyCourseTarget: 1,
      coursePlanConfigured: false,
      courseStartDate: '',
      courseTargetDate: '',
      courseTargetCount: 0,
      courseDailyMinutes: 30,
      courseIntensity: 'standard',
      coursePlanUpdatedAt: 0,
      courseDays: [],
      updatedAt: 0,
    },
    reviewSchedule: {
      schemaVersion: 1,
      items: {},
    },
    webCourses: {
      schemaVersion: 1,
      favorites: [],
      recent: [],
      courseSessions: [],
      courseSchedule: [],
      lastUrl: '',
      lastTitle: '',
    },
  };
}

let state = defaultState();
let saveTimer = null;
let toastTimer = null;
let toastQueue = 0;
let voiceCache = [];
let voiceHelpShown = false;
let appReady = false;
let currentAudio = null;
let kanaPreviewAudio = null;
let studyClockTimer = null;
let studyClockLastTick = Date.now();
let studyClockLastInteraction = 0;
let studyClockUnsavedSeconds = 0;
let shadowSession = null;
let pendingImportResult = null;
let courseBrowserState = {
  ok: false,
  attached: false,
  url: '',
  title: '',
  loading: false,
  canGoBack: false,
  canGoForward: false,
  error: '',
};
let courseBrowserAttached = false;
let courseBrowserSyncTimer = null;
let courseRecordKey = '';
let courseBrowserForceLoad = false;
let lastSavedAt = Date.now();
let appInfo = { version: '', dataPath: '' };
let preferredOutputDeviceId = '';
const REFERENCE_ACOUSTIC_CACHE_LIMIT = 24;
const referenceAcousticCache = new Map();

function readReferenceAcousticCache(fileName) {
  if (!referenceAcousticCache.has(fileName)) {
    return { hit: false, value: null };
  }
  const value = referenceAcousticCache.get(fileName);
  // Reinsert on access so Map insertion order acts as a small LRU queue.
  referenceAcousticCache.delete(fileName);
  referenceAcousticCache.set(fileName, value);
  return { hit: true, value };
}

function writeReferenceAcousticCache(fileName, value) {
  referenceAcousticCache.delete(fileName);
  referenceAcousticCache.set(fileName, value);
  while (referenceAcousticCache.size > REFERENCE_ACOUSTIC_CACHE_LIMIT) {
    referenceAcousticCache.delete(referenceAcousticCache.keys().next().value);
  }
}

try {
  preferredOutputDeviceId =
    localStorage.getItem('nihongo-audio-output-device') || '';
} catch {
  preferredOutputDeviceId = '';
}

const ui = {
  route: 'home',
  kanaGroup: 'all',
  hideRomaji: false,
  selectedKana: null,
  wordQuery: '',
  wordFilter: 'all',
  wordLevel: 'all',
  wordPos: 'all',
  wordTheme: 'all',
  wordPage: 1,
  selectedWord: null,
  lessonId: null,
  grammarQuery: '',
  grammarLevel: 'all',
  grammarFunction: 'all',
  grammarPage: 1,
  courseQuery: '',
  courseSaveLevel: '未分级',
  coursePlanSuggestion: null,
  courseCalendarMonth: todayKey().slice(0, 7),
  courseCalendarSelectedDate: todayKey(),
  calendarMonth: todayKey().slice(0, 7),
  calendarSelectedDate: todayKey(),
  translationDirection: 'ja-zh',
  translationSource: '',
  translationResult: null,
  translationStatus: 'idle',
  translationError: '',
  translationJapaneseText: '',
  lessonAnswers: {},
  lessonResults: {},
  grammarQuizScope: 'plan',
  quiz: null,
};

const NAV_ITEMS = [
  { id: 'home', label: '首页', icon: '家' },
  { id: 'kana', label: '五十音', icon: 'あ' },
  { id: 'words', label: '词汇', icon: '語' },
  { id: 'grammar', label: '语法', icon: '文' },
  { id: 'quiz', label: '测验', icon: '試' },
  { id: 'courses', label: '网课', icon: '講' },
  { id: 'translate', label: '翻译', icon: '訳' },
  { id: 'data', label: '数据', icon: '档' },
];

const ROUTE_META = {
  home: { eyebrow: '今日学习', title: '首页' },
  kana: { eyebrow: '发音基础', title: '五十音图' },
  words: { eyebrow: '词汇积累', title: '核心词汇' },
  grammar: { eyebrow: '句型与助词', title: '语法笔记' },
  quiz: { eyebrow: '检验掌握', title: '随机测验' },
  courses: { eyebrow: '学习打卡', title: '网课进度' },
  translate: { eyebrow: '中日互译', title: '翻译与知识点' },
  data: { eyebrow: '数据管理', title: '存档与进度' },
};

const GROUP_LABELS = Object.fromEntries(KANA_GROUPS.map((group) => [group.id, group.label]));

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function selectOptions(values, current, allLabel = '全部') {
  return [
    `<option value="all">${esc(allLabel)}</option>`,
    ...values.map(
      (value) =>
        `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(value)}</option>`,
    ),
  ].join('');
}

function themeBadges(values) {
  return (values || [])
    .map((value) => `<span class="theme-badge">${esc(value)}</span>`)
    .join('');
}

function romajiHint(text, reading = '') {
  const result = romanizeJapanese(text, reading);
  return result.ok ? result.romaji : '';
}

const EXAMPLE_ROMAJI_PARTICLES = new Set([
  'は',
  'が',
  'を',
  'に',
  'で',
  'と',
  'へ',
  'も',
  'の',
  'や',
  'から',
  'まで',
  'より',
]);

function exampleReadingRomaji(readingValue) {
  const reading = String(readingValue || '').trim();
  if (!reading) return '';
  const result = romanizeJapanese(reading, reading);
  if (!result.ok) return '';
  if (typeof Intl.Segmenter !== 'function') return result.romaji;
  const segments = [
    ...new Intl.Segmenter('ja', { granularity: 'word' }).segment(reading),
  ].map((item) => item.segment);
  const chunks = [];
  let buffer = '';
  const flush = () => {
    if (!buffer) return;
    chunks.push(romanizeKanaText(buffer));
    buffer = '';
  };
  segments.forEach((segment) => {
    if (EXAMPLE_ROMAJI_PARTICLES.has(segment)) {
      flush();
      chunks.push(
        segment === 'は'
          ? 'wa'
          : segment === 'へ'
            ? 'e'
            : segment === 'を'
              ? 'o'
              : romanizeKanaText(segment),
      );
      return;
    }
    if (/^[。、，,.！!？?「」『』]+$/.test(segment)) {
      flush();
      chunks.push(romanizeKanaText(segment));
      return;
    }
    buffer += segment;
  });
  flush();
  return chunks.join(' ').replace(/\s+([.,!?])/g, '$1');
}

const EXAMPLE_VERB_ROWS = {
  う: { renyou: 'い', mizen: 'わ', katei: 'え', ikou: 'お', te: 'って' },
  く: { renyou: 'き', mizen: 'か', katei: 'け', ikou: 'こ', te: 'いて' },
  ぐ: { renyou: 'ぎ', mizen: 'が', katei: 'げ', ikou: 'ご', te: 'いで' },
  す: { renyou: 'し', mizen: 'さ', katei: 'せ', ikou: 'そ', te: 'して' },
  つ: { renyou: 'ち', mizen: 'た', katei: 'て', ikou: 'と', te: 'って' },
  ぬ: { renyou: 'に', mizen: 'な', katei: 'ね', ikou: 'の', te: 'んで' },
  ぶ: { renyou: 'び', mizen: 'ば', katei: 'べ', ikou: 'ぼ', te: 'んで' },
  む: { renyou: 'み', mizen: 'ま', katei: 'め', ikou: 'も', te: 'んで' },
  る: { renyou: 'り', mizen: 'ら', katei: 'れ', ikou: 'ろ', te: 'って' },
};

function exampleWordGeneratedForms(word) {
  const surface = String(word.word || '').trim();
  const forms = new Set();
  if (surface.length < 2) return forms;
  const add = (...values) => {
    values
      .map((value) => String(value || '').trim())
      .filter((value) => value.length >= 2)
      .forEach((value) => forms.add(value));
  };
  if (word.pos === '动词') {
    if (surface.endsWith('する')) {
      const stem = surface.slice(0, -2);
      add(
        `${stem}します`,
        `${stem}しました`,
        `${stem}しません`,
        `${stem}して`,
        `${stem}した`,
        `${stem}しない`,
        `${stem}すれば`,
        `${stem}しよう`,
      );
    } else {
      const ending = surface.at(-1);
      const stem = surface.slice(0, -1);
      const row = EXAMPLE_VERB_ROWS[ending];
      if (row) {
        add(
          `${stem}${row.renyou}ます`,
          `${stem}${row.renyou}ました`,
          `${stem}${row.renyou}ません`,
          `${stem}${row.renyou}たい`,
          `${stem}${row.mizen}ない`,
          `${stem}${row.mizen}なかった`,
          `${stem}${row.katei}ば`,
          `${stem}${row.ikou}う`,
          `${stem}${row.te}`,
          `${stem}${row.te.slice(0, -1)}た`,
        );
        if (ending === 'る') {
          add(
            `${stem}ます`,
            `${stem}ました`,
            `${stem}ません`,
            `${stem}て`,
            `${stem}た`,
            `${stem}ない`,
            `${stem}なかった`,
            `${stem}れば`,
            `${stem}よう`,
          );
        }
        if (surface.endsWith('行く')) {
          add('行って', '行った', '行かない', '行きます');
        }
      }
    }
  } else if (word.pos === '形容词' && surface.endsWith('い')) {
    const stem = surface.slice(0, -1);
    add(
      `${stem}く`,
      `${stem}くて`,
      `${stem}かった`,
      `${stem}くなかった`,
      `${stem}ければ`,
    );
  } else if (word.pos === 'ナ形容词') {
    add(`${surface}な`, `${surface}に`, `${surface}です`, `${surface}でした`);
  }
  return forms;
}

function buildExampleWordIndex() {
  const byForm = new Map();
  const formsByWord = new Map();
  const levelRank = (word) => STUDY_LEVEL_RANK[word.level] || 99;
  const register = (formValue, word, priority) => {
    const form = String(formValue || '').trim();
    if (!form) return;
    if (!formsByWord.has(word.id)) formsByWord.set(word.id, new Set());
    formsByWord.get(word.id).add(form);
    const current = byForm.get(form);
    if (
      !current ||
      priority > current.priority ||
      (priority === current.priority && levelRank(word) < levelRank(current.word))
    ) {
      byForm.set(form, { word, priority });
    }
  };
  CONTENT_WORDS.forEach((word) => {
    register(word.word, word, 5);
    (word.aliases || []).forEach((alias) => register(alias, word, 4));
    if (!/[\u3400-\u9fff]/.test(word.word)) {
      register(word.kana, word, 3);
    }
    exampleWordGeneratedForms(word).forEach((form) =>
      register(form, word, 1),
    );
  });
  const byFirst = new Map();
  byForm.forEach((_entry, form) => {
    const first = form[0];
    if (!byFirst.has(first)) byFirst.set(first, []);
    byFirst.get(first).push(form);
  });
  byFirst.forEach((forms) =>
    forms.sort((left, right) => right.length - left.length),
  );
  return {
    byForm,
    byFirst,
    formsByWord,
  };
}

const EXAMPLE_WORD_INDEX = buildExampleWordIndex();

function exampleWordMatches(textValue, preferredWordId = '') {
  const text = String(textValue || '');
  if (!text) return [];
  const candidates = [];
  const seen = new Set();
  const addMatches = (form, word, priority) => {
    let start = text.indexOf(form);
    let count = 0;
    while (start >= 0 && count < 12) {
      const key = `${word.id}:${start}:${start + form.length}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({
          type: 'word',
          item: word,
          term: form,
          start,
          end: start + form.length,
          priority,
          preferred: word.id === preferredWordId,
        });
      }
      count += 1;
      start = text.indexOf(form, start + Math.max(1, form.length));
    }
  };
  const preferredForms = EXAMPLE_WORD_INDEX.formsByWord.get(preferredWordId);
  if (preferredForms) {
    [...preferredForms]
      .sort((left, right) => right.length - left.length)
      .forEach((form) => {
        const word = CONTENT_WORD_BY_ID[preferredWordId];
        if (word) addMatches(form, word, 6);
      });
  }
  for (let index = 0; index < text.length; index += 1) {
    const forms = EXAMPLE_WORD_INDEX.byFirst.get(text[index]) || [];
    for (const form of forms) {
      if (!text.startsWith(form, index)) continue;
      const entry = EXAMPLE_WORD_INDEX.byForm.get(form);
      if (entry) addMatches(form, entry.word, entry.priority);
    }
  }
  const chosen = [];
  const occupied = new Uint8Array(text.length);
  candidates
    .sort(
      (left, right) =>
        right.term.length - left.term.length ||
        Number(right.preferred) - Number(left.preferred) ||
        right.priority - left.priority ||
        left.start - right.start,
    )
    .forEach((candidate) => {
      for (let index = candidate.start; index < candidate.end; index += 1) {
        if (occupied[index]) return;
      }
      for (let index = candidate.start; index < candidate.end; index += 1) {
        occupied[index] = 1;
      }
      chosen.push(candidate);
    });
  return chosen.sort((left, right) => left.start - right.start);
}

function exampleWordMarkup(textValue, preferredWordId = '', readingValue = '') {
  const text = String(textValue || '');
  const reading = String(readingValue || '');
  const matches = exampleWordMatches(text, preferredWordId);
  let html = '';
  let cursor = 0;
  matches.forEach((match) => {
    if (match.start < cursor) return;
    html += esc(text.slice(cursor, match.start));
    html += `<button type="button" class="example-word-link"
      data-action="translation-knowledge"
      data-knowledge-type="word"
      data-knowledge-id="${esc(match.item.id)}"
      data-match-text="${esc(match.term)}"
      data-context-sentence="${esc(text)}"
      data-context-reading="${esc(reading)}"
      title="查看 ${esc(match.item.word)} 的读音和释义">${esc(
        text.slice(match.start, match.end),
      )}</button>`;
    cursor = match.end;
  });
  html += esc(text.slice(cursor));
  return {
    html,
    matches,
    wordCount: new Set(matches.map((match) => match.item.id)).size,
  };
}

function renderExampleStudyCard(example, preferredWordId = '', index = 0) {
  if (!example?.ja) return '';
  const reading = String(example.reading || '').trim();
  const marked = exampleWordMarkup(example.ja, preferredWordId, reading);
  const romaji = exampleReadingRomaji(reading);
  return `
    <article class="example-study-card">
      <div class="example-study-head">
        <span>例句 ${String(index + 1).padStart(2, '0')}</span>
        <small>${marked.wordCount ? `${marked.wordCount} 个词可点开` : '暂无已收录词汇标记'}</small>
      </div>
      <div class="example-study-ja">${marked.html}</div>
      <div class="example-study-reading">
        <span>假名读音</span>
        <p>${reading ? esc(reading) : '暂时缺少可靠假名读音，未推测汉字读法。'}</p>
      </div>
      <div class="example-study-romaji">
        <span>罗马音</span>
        <p>${romaji ? esc(romaji) : '暂时缺少可靠假名读音，无法生成罗马音。'}</p>
      </div>
      <div class="example-study-zh">${esc(example.zh || '')}</div>
      <div class="example-study-actions">
        <button class="small-button" type="button" data-action="speak"
          data-text="${esc(example.ja)}">朗读例句</button>
        <button class="small-button shadow-entry" type="button" data-action="shadow-open"
          data-shadow-text="${esc(example.ja)}"
          data-shadow-reading="${esc(reading || example.ja)}"
          data-shadow-has-reading="${Boolean(reading)}"
          data-shadow-zh="${esc(example.zh || '')}">跟读模仿</button>
      </div>
    </article>`;
}

function kanaPairMarkup(readingValue, variant = 'compact', longLabels = false) {
  const reading = String(readingValue ?? '').trim();
  const hasKanji = Array.from(reading).some((character) =>
    /[\u3400-\u9fff]/.test(character),
  );
  if (!reading || hasKanji) {
    return `<span class="kana-pair-empty kana-pair-${esc(variant)}">假名读音暂时无法确认</span>`;
  }
  const pair = kanaScriptPair(reading);
  const hiraganaLabel = longLabels ? '平假名' : '平';
  const katakanaLabel = longLabels ? '片假名' : '片';
  return `
    <span class="kana-script-pair kana-pair-${esc(variant)}">
      <span class="kana-script-item">
        <span class="kana-script-label">${hiraganaLabel}</span>
        <span class="kana-script-value">${esc(pair.hiragana)}</span>
      </span>
      <span class="kana-script-item">
        <span class="kana-script-label">${katakanaLabel}</span>
        <span class="kana-script-value">${esc(pair.katakana)}</span>
      </span>
    </span>`;
}

function renderSpeechComparison({
  sourceText,
  sourceReading,
  recognizedText,
  recognizedReading,
  score,
}) {
  const standardRomaji = romajiHint(sourceText, sourceReading || sourceText);
  const recognizedRomaji = romajiHint(
    recognizedText,
    recognizedReading || recognizedText,
  );
  return `
    <div class="speech-compare-grid">
      <section class="speech-compare-card standard">
        <span class="speech-compare-label">标准说法</span>
        <strong class="speech-compare-text">${esc(sourceText || '未配置')}</strong>
        ${kanaPairMarkup(sourceReading, 'speech', true)}
        <span class="speech-compare-romaji">${
          standardRomaji
            ? `<small>罗马音</small>${esc(standardRomaji)}`
            : '罗马音暂时无法确认'
        }</span>
      </section>
      <section class="speech-compare-card detected${score >= 80 ? ' matched' : ' mismatch'}">
        <span class="speech-compare-label">检测到</span>
        <strong class="speech-compare-text">${esc(recognizedText || '没有识别到文字')}</strong>
        ${kanaPairMarkup(recognizedReading, 'speech', true)}
        <span class="speech-compare-romaji">${
          recognizedRomaji
            ? `<small>罗马音</small>${esc(recognizedRomaji)}`
            : '罗马音暂时无法确认'
        }</span>
      </section>
    </div>`;
}

function todayKey(offset = 0) {
  const date = new Date(Date.now() + offset);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function isToday(timestamp) {
  if (!timestamp) return false;
  const date = new Date(timestamp);
  return (
    date.getFullYear() === new Date().getFullYear() &&
    date.getMonth() === new Date().getMonth() &&
    date.getDate() === new Date().getDate()
  );
}

function countToday(map, pick) {
  return Object.values(map).filter((value) => {
    if (typeof value === 'number') return isToday(value);
    if (value && typeof value === 'object') {
      return isToday(pick ? value[pick] : value.at);
    }
    return false;
  }).length;
}

function countTodayForIds(map, ids, pick) {
  return ids.reduce((count, id) => {
    const value = map?.[id];
    const timestamp =
      typeof value === 'number'
        ? value
        : value && typeof value === 'object'
          ? pick
            ? value[pick]
            : value.at
          : null;
    return count + (isToday(timestamp) ? 1 : 0);
  }, 0);
}

function learnedKanaCount() {
  return Object.keys(state.kana).length;
}

function masteredWordCount() {
  return Object.keys(state.words).length;
}

function completedGrammarCount() {
  return Object.keys(state.grammar).length;
}

function overallPercent() {
  const kana = learnedKanaCount() / KANA_TOTAL;
  const words = masteredWordCount() / WORD_TOTAL;
  const grammar = completedGrammarCount() / GRAMMAR_TOTAL;
  return Math.round((kana * 0.4 + words * 0.35 + grammar * 0.25) * 100);
}

function quizAccuracy() {
  if (!state.stats.answered) return null;
  return Math.round((state.stats.correct / state.stats.answered) * 100);
}

function studyFoundationLabel(level) {
  return STUDY_FOUNDATIONS.find(([id]) => id === level)?.[1] || '零基础';
}

function currentWeekStartKey() {
  const now = new Date();
  const weekday = (now.getDay() + 6) % 7;
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - weekday,
    12,
  );
  return localDateKey(monday.getTime());
}

function timestampInCurrentWeek(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return false;
  const start = new Date(`${currentWeekStartKey()}T00:00:00`).getTime();
  return value >= start && value <= Date.now();
}

function courseSessionEntries() {
  const sessions = (state.webCourses?.courseSessions || [])
    .filter((item) => Number(item?.at) > 0)
    .map((item) => ({
      at: Number(item.at),
      title: String(item.title || '日语网课'),
      url: String(item.url || ''),
      positionSeconds: normalizeCoursePositionSeconds(item.positionSeconds),
      legacy: false,
    }));
  const sessionDays = new Set(sessions.map((item) => localDateKey(item.at)));
  const legacySessions = (state.studyPlan?.courseDays || [])
    .filter((day) => !sessionDays.has(day))
    .map((day) => {
      const at = new Date(`${day}T12:00:00`).getTime();
      return {
        at: Number.isFinite(at) ? at : 0,
        title: '旧版网课记录',
        url: '',
        positionSeconds: 0,
        legacy: true,
      };
    })
    .filter((item) => item.at > 0);
  return [...sessions, ...legacySessions];
}

function courseSessionCountForDate(dateKey) {
  return courseSessionEntries().filter(
    (item) => localDateKey(item.at) === dateKey,
  ).length;
}

function courseSessionCountThisWeek() {
  return courseSessionEntries().filter((item) =>
    timestampInCurrentWeek(item.at),
  ).length;
}

function normalizePracticeGroupCount(value) {
  const count = Number(value);
  return PRACTICE_GROUP_OPTIONS.includes(count) ? count : 0;
}

function normalizePracticeQuestionCount(value) {
  const count = Number(value);
  return PRACTICE_QUESTION_OPTIONS.includes(count) ? count : 0;
}

function completedPracticeEntries() {
  const completedSessions = (state.practiceSessions || []).filter(
    (session) => session.status === 'completed',
  );
  const linkedSessionIds = new Set(
    completedSessions.map((session) => session.id),
  );
  const legacyQuizzes = (state.quizzes || [])
    .filter((quiz) => !quiz.sessionId || !linkedSessionIds.has(quiz.sessionId))
    .map((quiz) => ({
      id: quiz.sessionId || `legacy-${quiz.at}`,
      at: Number(quiz.at) || 0,
      plannedCount: Number(quiz.total) || 0,
      answeredCount: Number(quiz.total) || 0,
      score: Number(quiz.score) || 0,
      mode: quiz.mode || 'mixed',
      status: 'completed',
      legacy: true,
    }));
  return [...completedSessions, ...legacyQuizzes];
}

function practiceCountForDate(dateKey) {
  return completedPracticeEntries().filter(
    (entry) => localDateKey(entry.endedAt || entry.at) === dateKey,
  ).length;
}

function practiceQuestionCountForDate(dateKey) {
  return completedPracticeEntries()
    .filter((entry) => localDateKey(entry.endedAt || entry.at) === dateKey)
    .reduce(
      (total, entry) =>
        total + Math.max(0, Number(entry.answeredCount) || 0),
      0,
    );
}

function practiceCountThisWeek() {
  return completedPracticeEntries().filter((entry) =>
    timestampInCurrentWeek(entry.endedAt || entry.at),
  ).length;
}

function studyPlanTargetIsValid(currentLevel, targetLevel) {
  const currentRank = STUDY_LEVEL_RANK[currentLevel];
  const targetRank = STUDY_LEVEL_RANK[targetLevel];
  if (!Number.isFinite(currentRank) || !Number.isFinite(targetRank)) {
    return false;
  }
  return (
    targetRank > currentRank ||
    (currentLevel === 'N1' && targetLevel === 'N1')
  );
}

function suggestedTargetForFoundation(currentLevel) {
  if (currentLevel === 'N1') return 'N1';
  const currentRank = STUDY_LEVEL_RANK[currentLevel] || 0;
  return (
    STUDY_TARGET_LEVELS.find(
      (level) => STUDY_LEVEL_RANK[level] > currentRank,
    ) || 'N1'
  );
}

function levelStudyProgress(level) {
  const wordPool = CONTENT_WORDS.filter((word) => word.level === level);
  const grammarPool = CONTENT_GRAMMAR.filter(
    (lesson) => lesson.level === level,
  );
  const masteredWords = wordPool.filter((word) => state.words[word.id]).length;
  const completedGrammar = grammarPool.filter(
    (lesson) => state.grammar[lesson.id],
  ).length;
  const total = wordPool.length + grammarPool.length;
  const completed = masteredWords + completedGrammar;
  return {
    level,
    wordPool,
    grammarPool,
    masteredWords,
    completedGrammar,
    remainingWords: Math.max(0, wordPool.length - masteredWords),
    remainingGrammar: Math.max(0, grammarPool.length - completedGrammar),
    progressPercent: total ? Math.round((completed / total) * 100) : 100,
  };
}

function reviewEntryKey(type, id) {
  return `${type}:${id}`;
}

function masteredReviewAt(type, id) {
  if (type === 'word') return Number(state.words?.[id]) || 0;
  if (type === 'kana') return Number(state.kana?.[id]) || 0;
  if (type === 'grammar') {
    const record = state.grammar?.[id];
    return Number(record && typeof record === 'object' ? record.at : record) || 0;
  }
  return 0;
}

function reviewContentLevel(type, id) {
  if (type === 'word') return CONTENT_WORD_BY_ID[id]?.level || '';
  if (type === 'grammar') return CONTENT_GRAMMAR_BY_ID[id]?.level || '';
  if (type === 'kana') return '五十音';
  return '';
}

function reviewContentLabel(type, id) {
  if (type === 'word') {
    const word = CONTENT_WORD_BY_ID[id];
    return word ? `${word.word}（${word.kana}）` : '';
  }
  if (type === 'grammar') {
    return CONTENT_GRAMMAR_BY_ID[id]?.title || '';
  }
  if (type === 'kana') {
    const kana = KANA_BY_ID[id];
    return kana ? `${kana.hira}（${kana.romaji}）` : '';
  }
  return '';
}

function ensureReviewSchedule() {
  if (
    state.reviewSchedule?.schemaVersion === 1 &&
    state.reviewSchedule.items &&
    typeof state.reviewSchedule.items === 'object' &&
    !Array.isArray(state.reviewSchedule.items)
  ) {
    return state.reviewSchedule;
  }
  state.reviewSchedule = normalizeReviewSchedule(state.reviewSchedule);
  return state.reviewSchedule;
}

function removeReviewScheduleItem(type, id) {
  const schedule = ensureReviewSchedule();
  delete schedule.items[reviewEntryKey(type, id)];
}

function scheduleInitialReview(type, id, masteredAt = Date.now()) {
  if (!masteredReviewAt(type, id)) return;
  const schedule = ensureReviewSchedule();
  const key = reviewEntryKey(type, id);
  if (schedule.items[key]) return schedule.items[key];
  schedule.items[key] = {
    type,
    id,
    masteredAt,
    lastReviewedAt: 0,
    nextReviewAt: masteredAt + REVIEW_INTERVAL_DAYS[0] * DAY_MILLISECONDS,
    intervalDays: REVIEW_INTERVAL_DAYS[0],
    correctStreak: 0,
    lapses: 0,
    lastResult: '',
    source: 'mastered',
    updatedAt: masteredAt,
  };
  return schedule.items[key];
}

function effectiveReviewEntry(type, id) {
  const masteredAt = masteredReviewAt(type, id);
  if (!masteredAt) return null;
  const key = reviewEntryKey(type, id);
  const stored = ensureReviewSchedule().items[key];
  if (stored) return { ...stored, masteredAt };
  return {
    type,
    id,
    masteredAt,
    lastReviewedAt: 0,
    nextReviewAt: masteredAt + REVIEW_INTERVAL_DAYS[0] * DAY_MILLISECONDS,
    intervalDays: REVIEW_INTERVAL_DAYS[0],
    correctStreak: 0,
    lapses: 0,
    lastResult: '',
    source: 'derived',
    updatedAt: masteredAt,
  };
}

function collectReviewItems(metrics = studyPlanMetrics(), { dueOnly = false } = {}) {
  const now = Date.now();
  const allowedLevels = new Set(
    metrics
      ? [
          ...metrics.levels,
          ...(STUDY_TARGET_LEVELS.includes(metrics.plan.currentLevel)
            ? [metrics.plan.currentLevel]
            : []),
        ]
      : [],
  );
  const candidates = [];
  const pushCandidate = (type, id) => {
    const entry = effectiveReviewEntry(type, id);
    if (!entry) return;
    const level = reviewContentLevel(type, id);
    if (metrics && type !== 'kana' && !allowedLevels.has(level)) return;
    if (dueOnly && entry.nextReviewAt > now) return;
    const overdueDays = Math.max(
      0,
      Math.floor((now - entry.nextReviewAt) / DAY_MILLISECONDS),
    );
    candidates.push({
      ...entry,
      key: reviewEntryKey(type, id),
      level,
      label: reviewContentLabel(type, id),
      overdueDays,
      priority:
        overdueDays * 10 +
        entry.lapses * 4 +
        (entry.lastResult === 'wrong' ? 6 : 0) -
        entry.correctStreak,
    });
  };

  Object.keys(state.words || {}).forEach((id) => pushCandidate('word', id));
  Object.keys(state.grammar || {}).forEach((id) =>
    pushCandidate('grammar', id),
  );
  Object.keys(state.kana || {}).forEach((id) => pushCandidate('kana', id));
  return candidates.sort(
    (left, right) =>
      right.priority - left.priority ||
      left.nextReviewAt - right.nextReviewAt ||
      left.masteredAt - right.masteredAt,
  );
}

function reviewedKnowledgeKeysSince(timestamp) {
  const keys = new Set();
  for (const [key, entry] of Object.entries(
    ensureReviewSchedule().items,
  )) {
    if (
      Number(entry.lastReviewedAt) >= timestamp &&
      masteredReviewAt(entry.type, entry.id)
    ) {
      keys.add(key);
    }
  }
  for (const quiz of state.quizzes || []) {
    if (Number(quiz.at || quiz.completedAt) < timestamp) continue;
    for (const item of [
      ...(quiz.correctKnowledge || []),
      ...(quiz.wrongQuestions || []),
    ]) {
      if (item?.knowledgeType && item?.knowledgeId) {
        keys.add(reviewEntryKey(item.knowledgeType, item.knowledgeId));
      }
    }
  }
  return keys;
}

function reviewedKnowledgeCountSince(timestamp) {
  return reviewedKnowledgeKeysSince(timestamp).size;
}

function recordReviewOutcome(type, id, correct, source = 'quiz', at = Date.now()) {
  if (!['word', 'grammar', 'kana'].includes(type)) return;
  if (!masteredReviewAt(type, id)) return;
  const schedule = ensureReviewSchedule();
  const key = reviewEntryKey(type, id);
  const current =
    schedule.items[key] ||
    effectiveReviewEntry(type, id) || {
      type,
      id,
      masteredAt: at,
      lastReviewedAt: 0,
      nextReviewAt: at,
      intervalDays: REVIEW_INTERVAL_DAYS[0],
      correctStreak: 0,
      lapses: 0,
      lastResult: '',
      source,
      updatedAt: at,
    };
  const currentIndex = Math.max(
    0,
    REVIEW_INTERVAL_DAYS.indexOf(Number(current.intervalDays)),
  );
  const nextIndex = correct
    ? Math.min(REVIEW_INTERVAL_DAYS.length - 1, currentIndex + 1)
    : 0;
  const intervalDays = REVIEW_INTERVAL_DAYS[nextIndex];
  schedule.items[key] = {
    type,
    id,
    masteredAt: current.masteredAt,
    lastReviewedAt: at,
    nextReviewAt: at + intervalDays * DAY_MILLISECONDS,
    intervalDays,
    correctStreak: correct ? (Number(current.correctStreak) || 0) + 1 : 0,
    lapses: correct ? Number(current.lapses) || 0 : (Number(current.lapses) || 0) + 1,
    lastResult: correct ? 'correct' : 'wrong',
    source,
    updatedAt: at,
  };
}

function applyQuizReviewOutcomes(quiz, at = Date.now()) {
  const outcomes = new Map();
  for (const question of quiz.questions || []) {
    const type = question.knowledgeType || '';
    const id = question.knowledgeId || '';
    if (!type || !id) continue;
    const key = reviewEntryKey(type, id);
    const wrong = (quiz.wrong || []).some(
      (item) =>
        item.knowledgeType === type && item.knowledgeId === id,
    );
    outcomes.set(key, {
      type,
      id,
      correct: !wrong && (!outcomes.has(key) || outcomes.get(key).correct),
    });
  }
  for (const outcome of outcomes.values()) {
    recordReviewOutcome(
      outcome.type,
      outcome.id,
      outcome.correct,
      quiz.mode || 'quiz',
      at,
    );
  }
}

function stageTestStatus(metrics = studyPlanMetrics()) {
  if (!metrics) return null;
  const stageKey =
    metrics.stage.id === 'kana-foundation'
      ? 'kana'
      : metrics.stage.level || metrics.focusLevel;
  const tests = (state.quizzes || [])
    .filter(
      (quiz) =>
        quiz.mode === 'stage-test' &&
        quiz.stageLevel === stageKey &&
        Number(quiz.at || quiz.completedAt) > 0,
    )
    .sort(
      (left, right) =>
        Number(right.at || right.completedAt) -
        Number(left.at || left.completedAt),
    );
  const latest = tests[0] || null;
  const latestAt = Number(latest?.at || latest?.completedAt) || 0;
  const latestRate =
    latest && Number(latest.total) > 0
      ? Number(latest.score || 0) / Number(latest.total)
      : null;
  const retryDays = latestRate !== null && latestRate < 0.7 ? 3 : 7;
  const ready = Number(metrics.stage.progressPercent || 0) >= 50;
  return {
    stageKey,
    title: `${metrics.stage.title}测试`,
    ready,
    due:
      ready &&
      (!latestAt || Date.now() - latestAt >= retryDays * DAY_MILLISECONDS),
    doneToday: latestAt > 0 && localDateKey(latestAt) === todayKey(),
    doneThisWeek:
      latestAt > 0 && Number(latestAt) >= currentWeekStartTimestamp(),
    latestAt,
    latestRate,
  };
}

function currentWeekStartTimestamp() {
  return new Date(`${currentWeekStartKey()}T00:00:00`).getTime();
}

function buildStudyRoadmap(plan, levels, learnedKana) {
  const items = [];
  if (plan.currentLevel === 'zero') {
    const complete = learnedKana >= KANA_TOTAL;
    items.push({
      id: 'kana-foundation',
      title: '五十音起步',
      label: '假名与发音',
      progressPercent: Math.round((learnedKana / KANA_TOTAL) * 100),
      complete,
      detail: complete
        ? `五十音已完成，下一步衔接 ${levels[0] || 'N5'}。`
        : `先完成假名、发音和识别练习，还剩 ${Math.max(
            0,
            KANA_TOTAL - learnedKana,
          )} 个。`,
    });
  }

  levels.forEach((level) => {
    const stats = levelStudyProgress(level);
    const complete =
      stats.remainingWords === 0 && stats.remainingGrammar === 0;
    items.push({
      ...stats,
      id: `jlpt-${level.toLowerCase()}`,
      title: `${level} 阶段`,
      label: `词汇 ${stats.masteredWords}/${stats.wordPool.length} · 语法 ${stats.completedGrammar}/${stats.grammarPool.length}`,
      complete,
      detail: complete
        ? `${level} 本地内容已完成，可以进入后续阶段并安排复习。`
        : `本级还剩 ${stats.remainingWords} 个词汇、${stats.remainingGrammar} 个语法点。`,
    });
  });

  const activeIndex = items.findIndex((item) => !item.complete);
  return {
    items: items.map((item, index) => ({
      ...item,
      status:
        item.complete || activeIndex < 0 || index < activeIndex
          ? 'complete'
          : index === activeIndex
            ? 'active'
            : 'upcoming',
    })),
    active: activeIndex >= 0 ? items[activeIndex] : items[items.length - 1] || null,
  };
}

function calculateStudyPlanMetrics(plan) {
  if (!plan.configured) return null;
  const currentRank = STUDY_LEVEL_RANK[plan.currentLevel] || 0;
  const targetRank = STUDY_LEVEL_RANK[plan.targetLevel] || 1;
  let levels = STUDY_TARGET_LEVELS.filter((level) => {
    const rank = STUDY_LEVEL_RANK[level];
    return rank > currentRank && rank <= targetRank;
  });
  if (
    levels.length === 0 &&
    plan.currentLevel === 'N1' &&
    plan.targetLevel === 'N1'
  ) {
    levels = ['N1'];
  }

  const wordPool = CONTENT_WORDS.filter((word) =>
    levels.includes(word.level),
  );
  const grammarPool = CONTENT_GRAMMAR.filter((lesson) =>
    levels.includes(lesson.level),
  );
  const masteredWords = wordPool.filter((word) => state.words[word.id]).length;
  const completedGrammar = grammarPool.filter(
    (lesson) => state.grammar[lesson.id],
  ).length;
  const remainingWords = Math.max(0, wordPool.length - masteredWords);
  const remainingGrammar = Math.max(0, grammarPool.length - completedGrammar);
  const now = Date.now();
  const remainingCalendarDays = Math.max(
    1,
    Math.ceil((plan.targetDate - now) / DAY_MILLISECONDS),
  );
  const weeklyStudyDays = STUDY_WEEKLY_DAYS.includes(plan.weeklyStudyDays)
    ? plan.weeklyStudyDays
    : 7;
  const remainingStudyDays = Math.max(
    1,
    Math.ceil((remainingCalendarDays * weeklyStudyDays) / 7),
  );
  const expired = plan.targetDate > 0 && plan.targetDate < now;
  const requiredWordsPerDay = remainingWords
    ? Math.ceil(remainingWords / remainingStudyDays)
    : 0;
  const requiredGrammarPerDay = remainingGrammar
    ? Math.ceil(remainingGrammar / remainingStudyDays)
    : 0;
  const averageDifficulty = levels.length
    ? levels.reduce(
        (total, level) => total + (STUDY_LEVEL_DIFFICULTY[level] || 1),
        0,
      ) / levels.length
    : 1;
  const wordCapacity = Math.max(
    5,
    Math.floor(plan.dailyMinutes / (2 * averageDifficulty)),
  );
  const grammarCapacity = Math.max(
    1,
    Math.floor(plan.dailyMinutes / (20 * averageDifficulty)),
  );
  const learnedKana = learnedKanaCount();
  const zeroKanaRemaining =
    plan.currentLevel === 'zero' ? Math.max(0, KANA_TOTAL - learnedKana) : 0;
  const kanaDailyTarget =
    zeroKanaRemaining > 0 ? Math.min(5, zeroKanaRemaining) : 0;
  const roadmap = buildStudyRoadmap(plan, levels, learnedKana);
  const activeStage =
    roadmap.active ||
    {
      id: 'complete',
      title: '目标内容已完成',
      detail: '继续使用错题复习和混合练习巩固已学内容。',
      progressPercent: 100,
      level: plan.targetLevel,
    };
  const kanaStage = activeStage.id === 'kana-foundation';
  const focusStats =
    activeStage.level ? levelStudyProgress(activeStage.level) : null;
  const focusWordPool = focusStats?.wordPool || [];
  const focusGrammarPool = focusStats?.grammarPool || [];
  const focusRemainingWords = focusStats?.remainingWords || 0;
  const focusRemainingGrammar = focusStats?.remainingGrammar || 0;
  let wordTarget =
    !kanaStage && focusRemainingWords
      ? Math.min(
          Math.max(5, requiredWordsPerDay),
          wordCapacity,
          focusRemainingWords,
        )
      : 0;
  let grammarTarget =
    !kanaStage && focusRemainingGrammar
      ? Math.min(
          Math.max(1, requiredGrammarPerDay),
          grammarCapacity,
          focusRemainingGrammar,
        )
      : 0;
  const dueReviewItems = collectReviewItems(
    { levels, plan },
    { dueOnly: true },
  );
  const reviewDueCount = dueReviewItems.length;
  const reviewedThisWeek = reviewedKnowledgeCountSince(
    currentWeekStartTimestamp(),
  );
  const stageTest = stageTestStatus({
    plan,
    stage: activeStage,
    levels,
    focusLevel: activeStage.level || plan.targetLevel,
  });
  const recentWindowStart = Math.max(
    plan.startedAt || now,
    now - 3 * DAY_MILLISECONDS,
  );
  const recentWordCount = wordPool.filter((word) => {
    const at = Number(state.words[word.id]) || 0;
    return at >= recentWindowStart;
  }).length;
  const recentGrammarCount = grammarPool.filter((lesson) => {
    const record = state.grammar[lesson.id];
    const at = Number(record && typeof record === 'object' ? record.at : record) || 0;
    return at >= recentWindowStart;
  }).length;
  const recentExpected =
    (wordTarget + grammarTarget * 4) *
    Math.min(3, weeklyStudyDays || 1);
  const recentActual = recentWordCount + recentGrammarCount * 4;
  const recentRatio = recentExpected
    ? Math.min(1, recentActual / recentExpected)
    : 1;
  const planAge = Math.max(0, now - (plan.startedAt || now));
  const stageTestNeedsReview =
    stageTest?.latestRate !== null &&
    stageTest?.latestRate !== undefined &&
    stageTest.latestRate < 0.7 &&
    now - stageTest.latestAt < 7 * DAY_MILLISECONDS;
  const paceBehind =
    (planAge >= 2 * DAY_MILLISECONDS && recentRatio < 0.6) ||
    stageTestNeedsReview;
  if (paceBehind) {
    wordTarget = wordTarget
      ? Math.max(1, Math.floor(wordTarget * 0.75))
      : 0;
    grammarTarget = grammarTarget
      ? Math.max(1, Math.floor(grammarTarget * 0.75))
      : 0;
  }
  const paceAdjustment = {
    behind: paceBehind,
    recentRatio,
    stageTestNeedsReview,
    message: paceBehind
      ? '近期完成度较低或阶段测试需要巩固：本轮减少新知识，优先处理间隔复习和错题。'
      : '',
  };
  const practiceGroups =
    normalizePracticeGroupCount(plan.dailyPracticeGroups) ||
    (plan.dailyMinutes >= 75 ? 3 : 2);
  const practiceQuestionCount =
    normalizePracticeQuestionCount(plan.practiceQuestionsPerRound) ||
    (plan.dailyMinutes < 45 ? 6 : 10);
  const kanaStudyDays = zeroKanaRemaining
    ? Math.ceil(zeroKanaRemaining / 5)
    : 0;
  const estimatedStudyDays = Math.max(
    1,
    kanaStudyDays,
    Math.ceil(remainingWords / wordCapacity),
    Math.ceil(remainingGrammar / grammarCapacity),
  );
  const estimatedCalendarDays = Math.ceil(
    (estimatedStudyDays * 7) / weeklyStudyDays,
  );
  const paceFeasible =
    !expired && estimatedStudyDays <= remainingStudyDays;
  const suggestedDailyMinutes = Math.min(
    180,
    Math.max(
      15,
      Math.ceil(
        (requiredWordsPerDay * 2 * averageDifficulty +
          requiredGrammarPerDay * 20 * averageDifficulty +
          (kanaDailyTarget ? 10 : 0) +
          15) /
          5,
      ) * 5,
    ),
  );
  const courseMinutes =
    plan.dailyMinutes >= 60 ? 20 : plan.dailyMinutes >= 30 ? 15 : 10;
  const dailyCourseTarget = COURSE_DAILY_TARGETS.includes(
    Number(plan.dailyCourseTarget),
  )
    ? Number(plan.dailyCourseTarget)
    : 1;
  const courseWeeklyTarget = dailyCourseTarget * weeklyStudyDays;
  const courseFrequency = dailyCourseTarget
    ? `每周 ${courseWeeklyTarget} 节，按学习日每天 ${dailyCourseTarget} 节`
    : '未安排固定网课';
  const kanaMinutes = kanaStage
    ? Math.max(5, Math.round(plan.dailyMinutes * 0.55))
    : 0;
  const contentMinutes = Math.max(0, plan.dailyMinutes - kanaMinutes);
  const wordMinutes = wordTarget
    ? Math.round(contentMinutes * 0.5)
    : 0;
  const grammarMinutes = grammarTarget
    ? Math.round(contentMinutes * 0.3)
    : 0;
  const practiceMinutes = Math.max(
    0,
    contentMinutes - wordMinutes - grammarMinutes,
  );
  const recentCourseDays = [
    ...new Set(
      courseSessionEntries()
        .filter(
          (item) =>
            localDateKey(item.at) >= todayKey(-6 * DAY_MILLISECONDS),
        )
        .map((item) => localDateKey(item.at)),
    ),
  ];
  return {
    plan,
    levels,
    roadmap: roadmap.items,
    wordPool,
    grammarPool,
    focusWordPool,
    focusGrammarPool,
    focusLevel: activeStage.level || plan.targetLevel,
    focusRemainingWords,
    focusRemainingGrammar,
    dueReviewItems,
    reviewDueCount,
    reviewedThisWeek,
    stageTest,
    paceAdjustment,
    masteredWords,
    completedGrammar,
    remainingWords,
    remainingGrammar,
    remainingCalendarDays,
    remainingStudyDays,
    weeklyStudyDays,
    averageDifficulty,
    expired,
    requiredWordsPerDay,
    requiredGrammarPerDay,
    wordTarget,
    grammarTarget,
    practiceGroups,
    practiceQuestionCount,
    estimatedStudyDays,
    estimatedCalendarDays,
    paceFeasible,
    suggestedDailyMinutes,
    courseMinutes,
    dailyCourseTarget,
    courseWeeklyTarget,
    courseFrequency,
    recentCourseDays,
    recentCourseSessions: courseSessionCountThisWeek(),
    learnedKana,
    zeroKanaRemaining,
    kanaDailyTarget,
    stage: activeStage,
    kanaMinutes,
    wordMinutes,
    grammarMinutes,
    practiceMinutes,
  };
}

function studyPlanMetrics() {
  return calculateStudyPlanMetrics(state.studyPlan);
}

function stageLabel() {
  if (state.studyPlan.configured) {
    return `${studyFoundationLabel(state.studyPlan.currentLevel)} → ${state.studyPlan.targetLevel}`;
  }
  const percent = overallPercent();
  if (percent < 20) return '入门阶段';
  if (percent < 45) return '基础积累';
  if (percent < 70) return '稳步进阶';
  return '接近 N5 水平';
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function relativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function localDateKey(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function studyTimestamps() {
  const timestamps = [];
  const push = (value) => {
    const timestamp = Number(value);
    if (Number.isFinite(timestamp) && timestamp > 0) timestamps.push(timestamp);
  };
  Object.values(state.kana || {}).forEach(push);
  Object.values(state.words || {}).forEach(push);
  Object.values(state.grammar || {}).forEach((record) =>
    push(record && typeof record === 'object' ? record.at : record),
  );
  (state.quizzes || []).forEach((quiz) => push(quiz.at));
  (state.activity || []).forEach((item) => push(item.at));
  (state.webCourses?.recent || []).forEach((item) => push(item.at));
  courseSessionEntries().forEach((item) => push(item.at));
  (state.studyPlan?.courseDays || []).forEach((day) => {
    const parsed = new Date(`${day}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) timestamps.push(parsed.getTime());
  });
  return timestamps;
}

function studyDateKeys() {
  return [
    ...new Set([
      ...studyTimestamps().map(localDateKey).filter(Boolean),
      ...Object.entries(state.studySecondsByDay || {})
        .filter(([, seconds]) => Number(seconds) > 0)
        .map(([day]) => day),
    ]),
  ].sort();
}

function relativeDateKey(dateKey, offsetDays) {
  const [year, month, day] = String(dateKey)
    .split('-')
    .map((value) => Number(value));
  if (!year || !month || !day) return '';
  const date = new Date(year, month - 1, day + offsetDays, 12);
  return localDateKey(date.getTime());
}

function currentStudyStreak() {
  const studied = new Set(studyDateKeys());
  let cursor = todayKey();
  if (!studied.has(cursor)) {
    cursor = relativeDateKey(cursor, -1);
    if (!studied.has(cursor)) return 0;
  }
  let days = 0;
  while (studied.has(cursor)) {
    days += 1;
    cursor = relativeDateKey(cursor, -1);
  }
  return days;
}

function currentWeekStudyStats() {
  const now = new Date();
  const weekday = (now.getDay() + 6) % 7;
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - weekday,
    12,
  );
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(
      monday.getFullYear(),
      monday.getMonth(),
      monday.getDate() + index,
      12,
    );
    return localDateKey(date.getTime());
  }).filter((day) => day <= todayKey());
  const studied = new Set(studyDateKeys());
  const activeDays = days.filter((day) => studied.has(day)).length;
  const seconds = days.reduce(
    (total, day) => total + Number(state.studySecondsByDay?.[day] || 0),
    0,
  );
  return { days: days.length, activeDays, seconds };
}

function practiceRoundPlan(metrics = studyPlanMetrics()) {
  const plan = metrics?.plan || state.studyPlan;
  const groupCount =
    normalizePracticeGroupCount(plan.dailyPracticeGroups) ||
    Math.max(2, metrics?.practiceGroups || 2);
  const questionCount =
    normalizePracticeQuestionCount(plan.practiceQuestionsPerRound) ||
    metrics?.practiceQuestionCount ||
    6;
  const todayQuizCount = practiceCountForDate(todayKey());
  const wrongCount = storedWrongQuestions().length;
  const kanaStage =
    plan.currentLevel === 'zero' && learnedKanaCount() < KANA_TOTAL;
  const modes = kanaStage
    ? ['kana', 'kana', 'words']
    : ['words', 'grammar', wrongCount ? 'review' : 'mixed'];
  const titles = {
    kana: '假名识别',
    words: '词汇回忆',
    grammar: '语法应用',
    mix: '综合巩固',
    mixed: '综合巩固',
    review: '错题再练',
  };
  const details = {
    kana: '先看假名与读音，避免零基础直接进入词汇。',
    words: '从目标词库回忆读音和释义。',
    grammar: '用例句检查接续和句尾用法。',
    mix: '把不同知识点混合起来重新提取。',
    mixed: '把不同知识点混合起来重新提取。',
    review: wrongCount
      ? `错题本还有 ${wrongCount} 个知识点，答对后才会移出。`
      : '用综合题再巩固一次。',
  };
  return Array.from({ length: groupCount }, (_, index) => {
    const mode = modes[index] || (wrongCount ? 'review' : 'mixed');
    return {
      index,
      mode,
      count: questionCount,
      title: `第 ${index + 1} 轮 · ${titles[mode] || '练习'}`,
      detail: details[mode] || '换一种方式再回忆一次。',
      minutes: Math.max(2, Math.round(questionCount * 0.3)),
      completed: index < todayQuizCount,
    };
  });
}

function nextPracticeRound(rounds = practiceRoundPlan()) {
  return (
    rounds.find((round) => !round.completed) ||
    rounds[rounds.length - 1] || {
      mode: 'mixed',
      count: 6,
      title: '加练一轮',
    }
  );
}

function weekTargetData(metrics = studyPlanMetrics()) {
  if (!metrics) {
    return {
      activeDays: 0,
      kana: 0,
      words: 0,
      grammar: 0,
      practice: 0,
      stageTest: 0,
      courses: 0,
    };
  }
  const weeklyDays =
    metrics.weeklyStudyDays ?? state.studyPlan.weeklyStudyDays ?? 3;
  const kanaDailyTarget = metrics.kanaDailyTarget;
  const wordTarget = metrics.wordTarget;
  const grammarTarget = metrics.grammarTarget;
  const practiceGroups =
    metrics.practiceGroups ||
    normalizePracticeGroupCount(state.studyPlan.dailyPracticeGroups) ||
    2;
  const dailyCourseTarget =
    metrics.dailyCourseTarget ?? state.studyPlan.dailyCourseTarget ?? 0;
  return {
    activeDays: weeklyDays,
    kana: kanaDailyTarget * weeklyDays,
    words: wordTarget * weeklyDays,
    grammar: grammarTarget * weeklyDays,
    practice: practiceGroups * weeklyDays,
    stageTest: metrics.stageTest?.ready ? 1 : 0,
    courses: dailyCourseTarget * weeklyDays,
  };
}

function currentWeekTaskProgress(metrics = studyPlanMetrics()) {
  if (!metrics) {
    return { targets: weekTargetData(null), tasks: [] };
  }
  const targets = weekTargetData(metrics);
  const wordIds = new Set(metrics.wordPool.map((item) => item.id));
  const grammarIds = new Set(
    metrics.grammarPool.map((item) => item.id),
  );
  const weekDays = new Set(
    studyDateKeys().filter((day) => day >= currentWeekStartKey()),
  );
  const kana = Object.values(state.kana || {}).filter((value) =>
    timestampInCurrentWeek(value),
  ).length;
  const words = Object.entries(state.words || {}).filter(
    ([id, value]) => wordIds.has(id) && timestampInCurrentWeek(value),
  ).length;
  const grammar = Object.entries(state.grammar || {}).filter(([id, record]) => {
    const at = record && typeof record === 'object' ? record.at : record;
    return grammarIds.has(id) && timestampInCurrentWeek(at);
  }).length;
  const practice = practiceCountThisWeek();
  const courses = courseSessionCountThisWeek();
  const tasks = [
    {
      id: 'weekly-days',
      title: `本周学习 ${targets.activeDays} 天`,
      done: weekDays.size,
      target: targets.activeDays,
      route: 'home',
    },
    ...(targets.kana
      ? [
          {
            id: 'weekly-kana',
            title: `本周掌握 ${targets.kana} 个假名`,
            done: kana,
            target: targets.kana,
            route: 'kana',
          },
        ]
      : []),
    ...(targets.words
      ? [
          {
            id: 'weekly-words',
            title: `本周掌握 ${targets.words} 个词汇`,
            done: words,
            target: targets.words,
            route: 'words',
            level: metrics.focusLevel,
          },
        ]
      : []),
    ...(targets.grammar
      ? [
          {
            id: 'weekly-grammar',
            title: `本周完成 ${targets.grammar} 个语法点`,
            done: grammar,
            target: targets.grammar,
            route: 'grammar',
            level: metrics.focusLevel,
          },
        ]
      : []),
    {
      id: 'weekly-practice',
      title: `本周完成 ${targets.practice} 轮练习`,
      done: practice,
      target: targets.practice,
      route: 'quiz',
    },
    ...(targets.stageTest
      ? [
          {
            id: 'weekly-stage-test',
            title: '本周完成 1 次阶段测试',
            done: metrics.stageTest?.doneThisWeek ? 1 : 0,
            target: 1,
            route: 'quiz',
            mode: 'stage-test',
            count: Math.min(
              15,
              Math.max(10, metrics.practiceQuestionCount),
            ),
            level: metrics.focusLevel,
          },
        ]
      : []),
    ...(targets.courses
      ? [
          {
            id: 'weekly-courses',
            title: `本周学习 ${targets.courses} 节网课`,
            done: courses,
            target: targets.courses,
            route: 'courses',
          },
        ]
      : []),
  ].map((task) => ({
    ...task,
    done: Math.min(task.done, task.target),
    completed: task.done >= task.target,
  }));
  return { targets, tasks };
}

function formatStudyDuration(secondsValue) {
  const seconds = Math.max(0, Math.round(Number(secondsValue) || 0));
  if (!seconds) return '未记录';
  if (seconds < 60) return '不足 1 分钟';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function markStudyClockActivity() {
  if (!STUDY_ROUTES.has(ui.route)) return;
  studyClockLastInteraction = Date.now();
}

function commitStudyClock() {
  const now = Date.now();
  const visible = document.visibilityState !== 'hidden';
  const recentlyActive =
    studyClockLastInteraction > 0 &&
    now - studyClockLastInteraction <= 90 * 1000;
  let added = 0;
  if (visible && recentlyActive && STUDY_ROUTES.has(ui.route)) {
    const startedAt = studyClockLastTick;
    const startedKey = localDateKey(startedAt);
    const endedKey = localDateKey(now);
    const addSeconds = (dateKey, secondsValue) => {
      const seconds = Math.min(30, Math.max(0, secondsValue));
      if (!dateKey || !seconds) return 0;
      state.studySecondsByDay[dateKey] = Math.min(
        86400,
        Number(state.studySecondsByDay[dateKey] || 0) + seconds,
      );
      return seconds;
    };
    if (startedKey === endedKey) {
      added += addSeconds(startedKey, (now - startedAt) / 1000);
    } else {
      const endDate = new Date(now);
      const midnight = new Date(
        endDate.getFullYear(),
        endDate.getMonth(),
        endDate.getDate(),
      ).getTime();
      added += addSeconds(startedKey, (midnight - startedAt) / 1000);
      added += addSeconds(endedKey, (now - midnight) / 1000);
    }
    studyClockUnsavedSeconds += added;
  }
  studyClockLastTick = now;
  if (studyClockUnsavedSeconds >= 30) {
    studyClockUnsavedSeconds = 0;
    scheduleSave();
  }
  return added;
}

function startStudyClock() {
  if (studyClockTimer) return;
  studyClockLastTick = Date.now();
  studyClockTimer = setInterval(commitStudyClock, 15 * 1000);
}

function studyDayDetails(dateKey) {
  const matchesDate = (timestamp) => localDateKey(timestamp) === dateKey;
  const kana = Object.values(state.kana || {}).filter(matchesDate).length;
  const words = Object.values(state.words || {}).filter(matchesDate).length;
  const grammar = Object.values(state.grammar || {}).filter((record) =>
    matchesDate(record && typeof record === 'object' ? record.at : record),
  ).length;
  const quizGroups = (state.quizzes || []).filter((quiz) =>
    matchesDate(quiz.at),
  ).length;
  const quizzes = (state.quizzes || []).filter((quiz) =>
    matchesDate(quiz.at),
  );
  const recentCourseCount = (state.webCourses?.recent || []).filter((course) =>
    matchesDate(course.at),
  ).length;
  const recordedCourseCount = courseSessionCountForDate(dateKey);
  const courses = Math.max(recentCourseCount, recordedCourseCount);
  const activities = (state.activity || []).filter((item) =>
    matchesDate(item.at),
  );
  return {
    kana,
    words,
    grammar,
    quizGroups,
    courses,
    activities,
    studySeconds: Number(state.studySecondsByDay?.[dateKey] || 0),
    quizAnswered: quizzes.reduce(
      (total, quiz) => total + Number(quiz.total || 0),
      0,
    ),
    quizCorrect: quizzes.reduce(
      (total, quiz) => total + Number(quiz.score || 0),
      0,
    ),
    total: kana + words + grammar + quizGroups + courses,
  };
}

function calendarMonthParts() {
  const [year, month] = String(ui.calendarMonth)
    .split('-')
    .map((value) => Number(value));
  const safeYear = Number.isInteger(year) ? year : new Date().getFullYear();
  const safeMonth =
    Number.isInteger(month) && month >= 1 && month <= 12
      ? month
      : new Date().getMonth() + 1;
  return { year: safeYear, month: safeMonth };
}

function shiftCalendarMonth(offset) {
  const { year, month } = calendarMonthParts();
  const shifted = new Date(year, month - 1 + offset, 1);
  ui.calendarMonth = `${shifted.getFullYear()}-${String(
    shifted.getMonth() + 1,
  ).padStart(2, '0')}`;
  ui.calendarSelectedDate =
    ui.calendarMonth === todayKey().slice(0, 7)
      ? todayKey()
      : `${ui.calendarMonth}-01`;
}

function renderHomeCalendar() {
  const { year, month } = calendarMonthParts();
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leading = firstDay.getDay();
  const studiedDates = new Set(studyDateKeys());
  const monthDates = [...studiedDates].filter((day) =>
    day.startsWith(monthKey),
  );
  const selectedDate =
    ui.calendarSelectedDate?.startsWith(monthKey)
      ? ui.calendarSelectedDate
      : todayKey().startsWith(monthKey)
        ? todayKey()
        : `${monthKey}-01`;
  const selectedDetails = studyDayDetails(selectedDate);
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const cells = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const today = todayKey();
  const totalStudyDays = studiedDates.size;
  const streak = currentStudyStreak();
  const week = currentWeekStudyStats();
  const selectedHasRecord =
    selectedDetails.total > 0 || selectedDetails.studySeconds > 0;

  return `
    <section class="panel calendar-panel">
      <div class="calendar-heading">
        <div>
          <span class="calendar-kicker">STUDY LOG</span>
          <h3 class="panel-title">学习打卡日历</h3>
          <p class="panel-note">只显示本机真实学习记录</p>
        </div>
        <div class="calendar-month-nav">
          <button type="button" data-action="calendar-prev" aria-label="上个月">‹</button>
          <strong>${year} 年 ${month} 月</strong>
          <button type="button" data-action="calendar-next" aria-label="下个月">›</button>
          <button class="calendar-today-button" type="button" data-action="calendar-today">今天</button>
        </div>
      </div>
      <div class="calendar-summary">
        <span><strong>${streak}</strong> 天连续学习</span>
        <span><strong>${totalStudyDays}</strong> 天累计记录</span>
        <span><strong>${monthDates.length}</strong> 天本月打卡</span>
        <span>本周 <strong>${week.activeDays}/${week.days}</strong> 天 · 活跃 ${esc(formatStudyDuration(week.seconds))}</span>
      </div>
      <div class="calendar-weekdays" aria-hidden="true">
        ${weekdays.map((day) => `<span>${day}</span>`).join('')}
      </div>
      <div class="calendar-grid" role="grid" aria-label="${year}年${month}月学习日历">
        ${cells
          .map((day) => {
            if (!day) return '<span class="calendar-blank" aria-hidden="true"></span>';
            const dateKey = `${monthKey}-${String(day).padStart(2, '0')}`;
            const studied = studiedDates.has(dateKey);
            const isToday = dateKey === today;
            const isFuture = dateKey > today;
            const isMissed = !studied && !isToday && dateKey < today;
            const isSelected = dateKey === selectedDate;
            return `
              <button type="button" class="calendar-day${studied ? ' studied' : ''}${isToday ? ' today' : ''}${isFuture ? ' future' : ''}${isMissed ? ' missed' : ''}${isSelected ? ' selected' : ''}"
                data-action="calendar-select" data-date="${dateKey}"
                aria-label="${dateKey}${studied ? '，有学习记录' : isFuture ? '，未来日期' : '，无学习记录'}"
                ${isSelected ? 'aria-current="date"' : ''}>
                <span>${day}</span>
                ${studied ? '<i aria-hidden="true">✓</i>' : ''}
              </button>`;
          })
          .join('')}
      </div>
      <div class="calendar-legend">
        <span><i class="legend-dot studied"></i>已学习</span>
        <span><i class="legend-dot missed"></i>未打卡</span>
        <span><i class="legend-dot future"></i>未来</span>
        <span><i class="legend-dot today"></i>今天</span>
      </div>
      <div class="calendar-day-detail">
        <div class="calendar-detail-head">
          <strong>${selectedDate.replace(/-/g, '.')}</strong>
          <span>${selectedHasRecord ? `活跃学习时长 ${esc(formatStudyDuration(selectedDetails.studySeconds))}` : '这天还没有学习记录'}</span>
        </div>
        ${
          selectedHasRecord
            ? `<div class="calendar-detail-chips">
                ${selectedDetails.kana ? `<span>假名 ${selectedDetails.kana}</span>` : ''}
                ${selectedDetails.words ? `<span>词汇 ${selectedDetails.words}</span>` : ''}
                ${selectedDetails.grammar ? `<span>语法 ${selectedDetails.grammar}</span>` : ''}
                ${selectedDetails.quizGroups ? `<span>练习 ${selectedDetails.quizGroups} 组</span>` : ''}
                ${selectedDetails.quizAnswered ? `<span>答题 ${selectedDetails.quizCorrect}/${selectedDetails.quizAnswered}</span>` : ''}
                ${selectedDetails.courses ? `<span>网课 ${selectedDetails.courses}</span>` : ''}
              </div>`
            : '<p class="calendar-empty-note">完成任意学习任务后，这里会出现真实打卡记录。</p>'
        }
        ${
          selectedDetails.activities.length
            ? `<div class="calendar-activity-list">
                ${selectedDetails.activities
                  .slice(0, 3)
                  .map(
                    (item) =>
                      `<span><i></i>${esc(item.title)}</span>`,
                  )
                  .join('')}
              </div>`
            : ''
        }
      </div>
    </section>`;
}

function translationGrammarTerms(lesson) {
  const terms = new Set();
  const title = String(lesson.title || '');
  for (const match of title.matchAll(/「([^」]+)」/g)) {
    match[1]
      .split(/[・/／、,，]/)
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => terms.add(value));
  }
  for (const match of `${lesson.structure || ''} ${title}`.matchAll(
    /[ぁ-んァ-ヶー]{2,}/g,
  )) {
    terms.add(match[0]);
  }
  return [...terms]
    .filter((term) => term && !['动词', '名词', '形容词'].includes(term))
    .sort((left, right) => right.length - left.length);
}

function translationKnowledge(textValue) {
  const text = String(textValue || '');
  if (!text) return { matches: [], words: [], grammar: [] };
  const candidates = [];
  const seenCandidates = new Set();
  const addCandidate = (term, type, item) => {
    const value = String(term || '').trim();
    if (!value || (value.length < 2 && type === 'word')) return;
    const key = `${type}:${item.id}:${value}`;
    if (seenCandidates.has(key)) return;
    seenCandidates.add(key);
    let start = text.indexOf(value);
    let count = 0;
    while (start >= 0 && count < 8) {
      candidates.push({
        type,
        item,
        term: value,
        start,
        end: start + value.length,
      });
      start = text.indexOf(value, start + value.length);
      count += 1;
    }
  };

  CONTENT_GRAMMAR.forEach((lesson) => {
    translationGrammarTerms(lesson).forEach((term) =>
      addCandidate(term, 'grammar', lesson),
    );
  });
  CONTENT_WORDS.forEach((word) => {
    const surfaces = [word.word, ...(word.aliases || []), word.kana].filter(
      Boolean,
    );
    [...new Set(surfaces)].forEach((surface) =>
      addCandidate(surface, 'word', word),
    );
  });

  const chosen = [];
  const occupied = new Uint8Array(text.length);
  candidates
    .sort(
      (left, right) =>
        right.term.length - left.term.length ||
        left.start - right.start ||
        (left.type === 'grammar' ? -1 : 1),
    )
    .forEach((candidate) => {
      for (let index = candidate.start; index < candidate.end; index += 1) {
        if (occupied[index]) return;
      }
      for (let index = candidate.start; index < candidate.end; index += 1) {
        occupied[index] = 1;
      }
      chosen.push(candidate);
    });
  chosen.sort((left, right) => left.start - right.start);
  const words = [
    ...new Map(
      chosen
        .filter((match) => match.type === 'word')
        .map((match) => [match.item.id, match.item]),
    ).values(),
  ].slice(0, 20);
  const grammar = [
    ...new Map(
      chosen
        .filter((match) => match.type === 'grammar')
        .map((match) => [match.item.id, match.item]),
    ).values(),
  ].slice(0, 12);
  return { matches: chosen, words, grammar };
}

function translationMarkedText(text, matches) {
  if (!text) return '';
  let html = '';
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    html += esc(text.slice(cursor, match.start));
    html += `<button type="button" class="translation-mark ${esc(match.type)}"
      data-action="translation-knowledge"
      data-knowledge-type="${esc(match.type)}"
      data-knowledge-id="${esc(match.item.id)}"
      data-match-text="${esc(match.term)}">${esc(text.slice(match.start, match.end))}</button>`;
    cursor = match.end;
  }
  html += esc(text.slice(cursor));
  return html;
}

function translationDirectionLabel(direction) {
  return direction === 'zh-ja' ? '中 → 日' : '日 → 中';
}

function translationHistoryPreview(value, limit = 96) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function renderTranslate() {
  const direction = ui.translationDirection === 'zh-ja' ? 'zh-ja' : 'ja-zh';
  const sourceLabel = direction === 'ja-zh' ? '日语原文' : '中文原文';
  const targetLabel = direction === 'ja-zh' ? '中文译文' : '日语译文';
  const knowledgeText = ui.translationJapaneseText;
  const knowledge = translationKnowledge(knowledgeText);
  const loading = ui.translationStatus === 'loading';
  const history = normalizeTranslationHistory(state.translationHistory);
  return `
    <div class="page translation-page">
      <section class="panel translation-input-panel">
        <div class="translation-heading">
          <div>
            <span class="translation-kicker">SAKURA TRANSLATE</span>
            <h2>中日互译与知识点</h2>
            <p>支持句子和段落输入。翻译由第三方公共服务提供，词汇与语法识别使用本地 JLPT 内容层。</p>
          </div>
          <div class="segmented" role="group" aria-label="翻译方向">
            <button class="segment-button${direction === 'ja-zh' ? ' active' : ''}" type="button"
              data-action="translation-direction" data-direction="ja-zh">日语 → 中文</button>
            <button class="segment-button${direction === 'zh-ja' ? ' active' : ''}" type="button"
              data-action="translation-direction" data-direction="zh-ja">中文 → 日语</button>
          </div>
        </div>
        <label class="translation-label" for="translation-source">${sourceLabel}</label>
        <textarea id="translation-source" class="translation-textarea" maxlength="5000"
          placeholder="${direction === 'ja-zh' ? '例如：私は毎日日本語を勉強しています。' : '例如：我正在学习日语，希望明年通过 N4。'}"
          ${loading ? 'disabled' : ''}>${esc(ui.translationSource)}</textarea>
        <div class="translation-input-footer">
          <span>${ui.translationSource.length}/5000 字符 · 原文会发送到第三方翻译服务</span>
          <div class="translation-actions">
            <button class="secondary-button" type="button" data-action="translation-clear" ${loading ? 'disabled' : ''}>清空</button>
            <button class="primary-button" type="button" data-action="translation-run" ${loading ? 'disabled' : ''}>
              ${loading ? '正在翻译…' : '翻译并识别知识点'}
            </button>
          </div>
        </div>
      </section>

      <section class="panel translation-result-panel">
        <div class="panel-head">
          <div>
            <h3 class="panel-title">${targetLabel}</h3>
            <p class="panel-note">翻译、词汇识别和语法识别是三个独立步骤。</p>
          </div>
          ${
            ui.translationResult?.provider
              ? `<span class="translation-provider">由 ${esc(ui.translationResult.provider)} 提供</span>`
              : ''
          }
        </div>
        ${
          ui.translationStatus === 'error'
            ? `<div class="translation-error">
                <strong>翻译暂时不可用</strong>
                <p>${esc(ui.translationError || '请检查网络后重试')}</p>
                <p>没有使用词典拼接伪造译文。若原文是日语，下方仍会显示本地词库能够确认的知识点。</p>
              </div>`
            : ''
        }
        ${
          ui.translationStatus === 'loading'
            ? `<div class="translation-loading"><span></span><p>正在连接翻译服务…</p></div>`
            : ui.translationResult?.text
              ? `<div class="translation-output">${esc(ui.translationResult.text)}</div>`
              : '<div class="translation-placeholder">输入内容并点击翻译后，这里会显示结果。</div>'
        }
      </section>

      <section class="panel translation-history-panel">
        <div class="panel-head">
          <div>
            <h3 class="panel-title">最近翻译</h3>
            <p class="panel-note">自动保留最近 ${history.length}/50 条成功翻译；点击可恢复原文、译文和知识点。</p>
          </div>
          <span class="translation-history-count">${history.length} 条</span>
        </div>
        ${
          history.length
            ? `<div class="translation-history-list">
                ${history
                  .map(
                    (item, index) => `
                    <button type="button" class="translation-history-item"
                      data-action="translation-history-open" data-index="${index}">
                      <span class="translation-history-direction">${translationDirectionLabel(item.direction)}</span>
                      <span class="translation-history-copy">
                        <strong>${esc(translationHistoryPreview(item.source))}</strong>
                        <small>${esc(translationHistoryPreview(item.text, 110))}</small>
                      </span>
                      <time>${esc(relativeTime(item.at))}</time>
                    </button>`,
                  )
                  .join('')}
              </div>`
            : '<div class="translation-history-empty">完成一次翻译后，最近记录会保存在这里。</div>'
        }
      </section>

      ${
        knowledgeText
          ? `<section class="panel translation-knowledge-panel">
              <div class="panel-head">
                <div>
                  <h3 class="panel-title">本句知识点</h3>
                  <p class="panel-note">依据现有 JLPT 词库和语法库自动匹配，可能存在分词或语境误差。</p>
                </div>
                <span class="translation-knowledge-count">${knowledge.words.length} 个词汇 · ${knowledge.grammar.length} 个语法</span>
              </div>
              ${
                direction === 'ja-zh'
                  ? `<div class="translation-source-preview">${translationMarkedText(knowledgeText, knowledge.matches)}</div>`
                  : `<div class="translation-mark-note">以下是日语译文中的本地知识点标记：</div><div class="translation-source-preview">${translationMarkedText(knowledgeText, knowledge.matches)}</div>`
              }
              ${
                knowledge.words.length || knowledge.grammar.length
                  ? `<div class="translation-knowledge-groups">
                      <div>
                        <h4>词汇</h4>
                        <div class="translation-point-list">
                          ${
                            knowledge.words.length
                              ? knowledge.words
                                  .map(
                                    (word) => `
                              <button type="button" data-action="translation-knowledge"
                                data-knowledge-type="word" data-knowledge-id="${esc(word.id)}"
                                data-match-text="${esc(word.word)}">
                                <strong>${esc(word.word)}</strong>
                                <span>${esc(word.pos)} · ${esc(word.level)}</span>
                              </button>`,
                                  )
                                  .join('')
                              : '<p class="translation-empty-inline">暂未收录匹配词汇</p>'
                          }
                        </div>
                      </div>
                      <div>
                        <h4>语法</h4>
                        <div class="translation-point-list">
                          ${
                            knowledge.grammar.length
                              ? knowledge.grammar
                                  .map(
                                    (lesson) => `
                              <button type="button" data-action="translation-knowledge"
                                data-knowledge-type="grammar" data-knowledge-id="${esc(lesson.id)}"
                                data-match-text="${esc(lesson.title)}">
                                <strong>${esc(lesson.title)}</strong>
                                <span>${esc(lesson.level)} · ${esc(lesson.structure)}</span>
                              </button>`,
                                  )
                                  .join('')
                              : '<p class="translation-empty-inline">暂未收录匹配语法</p>'
                          }
                        </div>
                      </div>
                    </div>`
                  : '<div class="translation-no-knowledge">暂未收录：当前词库和语法库没有自动匹配到可确认的知识点。这不代表原文没有词汇或语法。</div>'
              }
            </section>`
          : ''
      }
    </div>`;
}

async function performTranslation() {
  const source = ui.translationSource.trim();
  const direction = ui.translationDirection;
  if (!source) {
    toast('请输入需要翻译的内容');
    return;
  }
  ui.translationStatus = 'loading';
  ui.translationError = '';
  ui.translationResult = null;
  ui.translationJapaneseText = direction === 'ja-zh' ? source : '';
  render(true);
  try {
    const result = await bridge.translateText({ text: source, direction });
    if (!result?.ok || !result.text) {
      throw new Error(result?.error || '翻译服务没有返回有效译文');
    }
    ui.translationResult = result;
    ui.translationJapaneseText =
      direction === 'ja-zh' ? source : result.text;
    ui.translationStatus = 'success';
    const historyEntry = {
      id: `translation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
      direction,
      source,
      text: result.text,
      provider: result.provider || '',
      japaneseText: direction === 'ja-zh' ? source : result.text,
    };
    state.translationHistory = [
      historyEntry,
      ...(state.translationHistory || []).filter(
        (item) => item.direction !== direction || item.source !== source,
      ),
    ].slice(0, 50);
    scheduleSave();
  } catch (error) {
    ui.translationStatus = 'error';
    ui.translationError = error?.message || '请检查网络后重试';
  } finally {
    render(true);
  }
}

function openTranslationKnowledge(button) {
  const type = button.dataset.knowledgeType;
  const id = button.dataset.knowledgeId;
  const matchedText = button.dataset.matchText || '';
  const contextSentence = button.dataset.contextSentence || '';
  const contextReading = button.dataset.contextReading || '';
  const contextRomaji = contextSentence
    ? exampleReadingRomaji(contextReading)
    : '';
  if (type === 'word') {
    const word = CONTENT_WORD_BY_ID[id];
    if (!word) return;
    openModal(`
      <span class="translation-card-kicker">词汇知识点</span>
      <h3>${esc(word.word)}</h3>
      <div class="translation-card-reading">
        ${kanaPairMarkup(word.kana, 'detail', true)}
        <span class="translation-card-romaji">${esc(word.romaji || romajiHint(word.kana, word.kana))}</span>
      </div>
      <div class="translation-card-meta">
        <span>${esc(word.pos)}</span>
        <span>JLPT ${esc(word.level)}</span>
      </div>
      <div class="translation-card-section">
        <strong>中文释义</strong>
        <p class="translation-card-meaning">${esc(word.meaning)}</p>
      </div>
      <div class="translation-card-section">
        <strong>原句中的含义</strong>
        <p>${esc(matchedText || word.word)}：${esc(word.meaning)}</p>
        <small>释义来自现有词库，尚未进行词义消歧。</small>
      </div>
      ${
        contextSentence
          ? `<div class="translation-card-section translation-card-context">
              <strong>例句语境</strong>
              <p>${esc(contextSentence)}</p>
              <small>${contextRomaji ? `罗马音：${esc(contextRomaji)}` : '缺少可靠假名读音，暂不推测罗马音。'}</small>
            </div>`
          : ''
      }
      <div class="modal-actions">
        <button class="small-button" type="button" data-action="speak" data-text="${esc(word.kana)}">朗读词汇</button>
        ${
          contextSentence
            ? `<button class="small-button shadow-entry" type="button" data-action="shadow-open"
                data-shadow-text="${esc(contextSentence)}"
                data-shadow-reading="${esc(contextReading || contextSentence)}"
                data-shadow-has-reading="${Boolean(contextReading)}"
                data-shadow-zh="${esc(word.meaning)}">跟读这句</button>`
            : ''
        }
        <button class="secondary-button" type="button" data-action="modal-cancel">关闭</button>
      </div>`);
    return;
  }
  const lesson = CONTENT_GRAMMAR_BY_ID[id];
  if (!lesson) return;
  openModal(`
    <span class="translation-card-kicker">语法知识点</span>
    <h3>${esc(lesson.title)}</h3>
    <div class="translation-card-meta">
      <span>JLPT ${esc(lesson.level)}</span>
      ${lesson.functions.slice(0, 3).map((item) => `<span>${esc(item)}</span>`).join('')}
    </div>
    <div class="translation-card-section">
      <strong>接续形式</strong>
      <p>${esc(lesson.structure)}</p>
    </div>
    <div class="translation-card-section">
      <strong>中文解释</strong>
      <p>${esc(lesson.explanation)}</p>
    </div>
    <div class="translation-card-section">
      <strong>原句中的用法</strong>
      <p>${esc(matchedText || lesson.title)}：${esc(lesson.usage)}</p>
      <small>自动匹配只确认语法点出现，具体上下文仍需结合原句判断。</small>
    </div>
    <div class="modal-actions">
      <button class="secondary-button" type="button" data-action="modal-cancel">关闭</button>
    </div>`);
}

function toast(message) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.add('show');
  toastQueue += 1;
  const current = toastQueue;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (current === toastQueue) els.toast.classList.remove('show');
  }, 2200);
}

function refreshVoices() {
  if (!window.speechSynthesis || typeof window.speechSynthesis.getVoices !== 'function') {
    return voiceCache;
  }
  voiceCache = window.speechSynthesis.getVoices() || [];
  return voiceCache;
}

function japaneseVoice() {
  return (
    voiceCache.find((voice) => /^ja([-_]|$)/i.test(voice.lang || '')) ??
    voiceCache.find((voice) =>
      /japanese|日本語|haruka|nanami|ayumi|ichiro|keita/i.test(voice.name || ''),
    ) ??
    null
  );
}

async function speakWithSystem(text, attempt = 0) {
  if (bridge.hasNativeSpeech?.()) {
    try {
      const result = await bridge.speakJapanese(text, {
        onStart() {
          toast('正在使用 Android 日语语音朗读');
        },
      });
      if (!result?.ok && !result?.superseded && !result?.canceled) {
        toast(result?.error || 'Android 日语朗读失败');
        if (
          (result?.code === 'tts-unavailable' ||
            result?.code === 'tts-japanese-unavailable') &&
          !voiceHelpShown
        ) {
          voiceHelpShown = true;
          openVoiceHelp();
        }
      }
    } catch (error) {
      toast(error?.message || 'Android 日语朗读失败');
    }
    return;
  }
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
    toast('当前系统不支持语音朗读');
    return;
  }
  refreshVoices();
  const voice = japaneseVoice();
  if (!voice) {
    if (!voiceCache.length && attempt < 4) {
      setTimeout(() => speakWithSystem(text, attempt + 1), 250);
      return;
    }
    if (!voiceCache.length) {
      toast('没有检测到可用的语音');
      return;
    }
    toast('系统未安装日语语音');
    if (!voiceHelpShown) {
      voiceHelpShown = true;
      openVoiceHelp();
    }
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.voice = voice;
  utterance.rate = 0.85;
  utterance.volume = 1;
  utterance.onerror = (event) => {
    if (event && event.error && event.error !== 'interrupted' && event.error !== 'canceled') {
      toast(`朗读失败：${event.error}`);
    }
  };
  try {
    synth.cancel();
    synth.speak(utterance);
  } catch (error) {
    console.error('朗读失败', error);
    toast('朗读失败');
  }
}

function supportsAudioOutputSelection() {
  return (
    typeof HTMLMediaElement !== 'undefined' &&
    typeof HTMLMediaElement.prototype.setSinkId === 'function'
  );
}

function storePreferredOutputDevice(deviceId) {
  preferredOutputDeviceId = deviceId || '';
  try {
    if (preferredOutputDeviceId) {
      localStorage.setItem('nihongo-audio-output-device', preferredOutputDeviceId);
    } else {
      localStorage.removeItem('nihongo-audio-output-device');
    }
  } catch {
    // Device preference is optional; playback can still use the system default.
  }
}

function routeAudioOutput(audio) {
  if (!audio || !preferredOutputDeviceId || !supportsAudioOutputSelection()) {
    return Promise.resolve();
  }
  return audio.setSinkId(preferredOutputDeviceId).catch((error) => {
    console.warn('切换播放设备失败，将使用系统默认设备', error);
    return Promise.reject(error);
  });
}

function playBundledAudio(text) {
  const file =
    typeof AUDIO_MANIFEST !== 'undefined' ? AUDIO_MANIFEST[text] : null;
  if (!file) return false;

  bridge.stopNativeSpeech?.();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (currentAudio) {
    try {
      currentAudio.pause();
    } catch {
      // ignore
    }
  }

  const audio = new Audio(`./audio/${file}`);
  currentAudio = audio;
  let fellBack = false;
  const fallback = () => {
    if (fellBack) return;
    fellBack = true;
    if (currentAudio === audio) currentAudio = null;
    speakWithSystem(text);
  };
  audio.addEventListener('error', fallback, { once: true });
  const startPlayback = () => {
    try {
      const promise = audio.play();
      if (promise && typeof promise.catch === 'function') promise.catch(fallback);
    } catch {
      fallback();
    }
  };
  try {
    if (preferredOutputDeviceId && supportsAudioOutputSelection()) {
      audio
        .setSinkId(preferredOutputDeviceId)
        .then(startPlayback)
        .catch(() => {
          toast('已保存的播放设备不可用，已改用系统默认设备');
          storePreferredOutputDevice('');
          startPlayback();
        });
    } else {
      startPlayback();
    }
  } catch {
    fallback();
  }
  return true;
}

function speak(text, attempt = 0) {
  if (playBundledAudio(text)) return;
  speakWithSystem(text, attempt);
}

function kanaBundledAudioMissing() {
  if (typeof AUDIO_MANIFEST === 'undefined') return KANA_CELLS.length;
  return KANA_CELLS.filter((cell) => !AUDIO_MANIFEST[cell.hira]).length;
}

function systemSpeechUnavailable() {
  if (bridge.hasNativeSpeech?.()) return false;
  if (!('speechSynthesis' in window)) return true;
  const voices = refreshVoices();
  return voices.length > 0 && !japaneseVoice();
}

function shadowReferenceAudioFile(text, reading = '') {
  if (typeof AUDIO_MANIFEST === 'undefined') return '';
  return (
    AUDIO_MANIFEST[text] ||
    (reading ? AUDIO_MANIFEST[reading] : '') ||
    ''
  );
}

function stopMobileSpeechPlayback() {
  bridge.stopNativeSpeech?.();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
      // Audio may already be detached or unloaded.
    }
  }
}

function setSaveStatus(mode) {
  if (!els.saveState) return;
  els.saveState.classList.toggle('saving', mode === 'saving');
  els.saveText.textContent =
    mode === 'saving' ? '正在保存…' : mode === 'error' ? '保存失败，稍后重试' : '已保存到本地';
}

function isAllowedBilibiliUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return ['bilibili.com', 'bilibili.tv', 'b23.tv'].some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

function courseUrlKey(value) {
  if (!isAllowedBilibiliUrl(value)) return '';
  const url = new URL(value);
  const page = url.searchParams.get('p');
  return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '')}${
    page ? `?p=${encodeURIComponent(page)}` : ''
  }`;
}

function isCourseLearningUrl(value) {
  if (!isAllowedBilibiliUrl(value)) return false;
  const pathName = new URL(value).pathname;
  return (
    /\/video\/(?:BV|av)/i.test(pathName) ||
    /\/cheese\/play\//i.test(pathName) ||
    /\/bangumi\/play\//i.test(pathName) ||
    /\/medialist\/play\//i.test(pathName)
  );
}

function normalizeCourseLevel(value) {
  return COURSE_LEVELS.includes(value) ? value : '未分级';
}

function normalizeCourseStatus(value) {
  return COURSE_STATUSES.includes(value) ? value : 'unstarted';
}

function normalizeCoursePositionSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(86400, Math.round(seconds));
}

const COURSE_RESOURCE_TYPES = ['bilibili', 'local'];
const COURSE_CATEGORIES = [
  '综合日语',
  '五十音',
  '词汇',
  '语法',
  '听力',
  '口语',
  '阅读',
  '考试对策',
  '其他',
];

function normalizeCourseDurationMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.min(24 * 60, Math.round(minutes));
}

function normalizeCoursePercent(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, Math.round(percent)));
}

function normalizeCourseCategory(value) {
  const category = String(value || '').trim().slice(0, 40);
  return category || '综合日语';
}

function normalizeCourseLocalPath(value) {
  const localPath = String(value || '').trim();
  if (!localPath || localPath.includes('\0')) return '';
  if (!/^(?:[a-zA-Z]:[\\/]|\\\\)/.test(localPath)) return '';
  return localPath.slice(0, 1024);
}

function normalizeCourseResourceType(value, url = '', localPath = '') {
  if (value === 'local' && normalizeCourseLocalPath(localPath)) return 'local';
  if (value === 'bilibili' && isAllowedBilibiliUrl(url)) return 'bilibili';
  if (isAllowedBilibiliUrl(url)) return 'bilibili';
  if (normalizeCourseLocalPath(localPath)) return 'local';
  return '';
}

function normalizeCoursePlanDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(`${text}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return localDateKey(date.getTime()) === text ? text : '';
}

function normalizeCourseIntensity(value) {
  return COURSE_PLAN_INTENSITIES.some(([id]) => id === value)
    ? value
    : 'standard';
}

function courseResourceKey(item) {
  const localPath = normalizeCourseLocalPath(item?.localPath);
  if (localPath) return `local:${localPath.toLowerCase()}`;
  const url = isAllowedBilibiliUrl(item?.url) ? String(item.url) : '';
  return url ? `bilibili:${courseUrlKey(url)}` : '';
}

function normalizeCourseSchedule(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const date = normalizeCoursePlanDate(item?.date);
      const courseId = String(item?.courseId || '').trim().slice(0, 160);
      const chapterId = String(item?.chapterId || '').trim().slice(0, 160);
      const key = `${date}:${courseId}:${chapterId}`;
      if (!date || !courseId || seen.has(key)) return null;
      seen.add(key);
      return {
        id: String(item?.id || `schedule-${index + 1}`).slice(0, 180),
        date,
        courseId,
        chapterId,
        plannedMinutes: normalizeCourseDurationMinutes(item?.plannedMinutes),
        order: Number.isFinite(Number(item?.order))
          ? Number(item.order)
          : index + 1,
        createdAt: Number(item?.createdAt) || Date.now(),
      };
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.order - right.order,
    )
    .slice(0, 5000);
}

function normalizeCourseChapters(items, parentKey) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const localPath = normalizeCourseLocalPath(item?.localPath);
      const url = isAllowedBilibiliUrl(item?.url) ? String(item.url) : '';
      const resourceType = normalizeCourseResourceType(
        item?.resourceType,
        url,
        localPath,
      );
      const key = courseResourceKey({ url, localPath });
      if (!resourceType || !key || seen.has(key)) return null;
      seen.add(key);
      return {
        id: String(item?.id || `${parentKey}-chapter-${index + 1}`).slice(0, 160),
        title: String(item?.title || `章节 ${index + 1}`).slice(0, 160),
        resourceType,
        url,
        localPath,
        durationMinutes: normalizeCourseDurationMinutes(item?.durationMinutes),
        order: Number.isFinite(Number(item?.order))
          ? Number(item.order)
          : index + 1,
        status: normalizeCourseStatus(item?.status),
        progressSeconds: normalizeCoursePositionSeconds(item?.progressSeconds),
        progressPercent: normalizeCoursePercent(item?.progressPercent),
        notes: String(item?.notes || '').slice(0, 1000),
        updatedAt: Number(item?.updatedAt) || 0,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.order - right.order)
    .slice(0, 500);
}

function normalizeWebCourses(value) {
  const source = value && typeof value === 'object' ? value : {};
  const seen = new Set();
  const favorites = (Array.isArray(source.favorites) ? source.favorites : [])
    .map((item, index) => {
      const localPath = normalizeCourseLocalPath(item?.localPath);
      const url = isAllowedBilibiliUrl(item?.url) ? String(item.url) : '';
      let resourceType = normalizeCourseResourceType(
        item?.resourceType,
        url,
        localPath,
      );
      const id = String(item?.id || courseResourceKey({ url, localPath })).slice(
        0,
        160,
      );
      const chapters = normalizeCourseChapters(item?.chapters, id);
      const isGroup = item?.kind === 'course' || chapters.length > 0;
      let key = courseResourceKey({ url, localPath });
      if (!key && isGroup) {
        resourceType = 'local';
        key = `course:${id}`;
      }
      if (!resourceType || !key || seen.has(key)) return null;
      seen.add(key);
      const lastPositionSeconds = normalizeCoursePositionSeconds(
        item?.lastPositionSeconds ?? item?.progressSeconds,
      );
      const lastPositionDuration = normalizeCoursePositionSeconds(
        item?.lastPositionDuration,
      );
      return {
        id,
        kind: isGroup ? 'course' : 'lesson',
        title: String(item?.title || '未命名课程').slice(0, 240),
        source:
          String(
            item?.source ||
              (resourceType === 'bilibili' ? 'Bilibili' : '本地文件'),
          ).slice(0, 80),
        resourceType,
        url,
        localPath,
        durationMinutes: normalizeCourseDurationMinutes(
          item?.durationMinutes,
        ),
        category: normalizeCourseCategory(item?.category),
        notes: String(item?.notes || '').slice(0, 2000),
        order: Number.isFinite(Number(item?.order))
          ? Number(item.order)
          : index + 1,
        level: normalizeCourseLevel(item?.level),
        status: normalizeCourseStatus(item?.status),
        addedAt: Number(item?.addedAt) || Date.now(),
        lastVisitedAt: Number(item?.lastVisitedAt) || 0,
        lastPositionSeconds,
        lastPositionDuration,
        lastPositionAt: Number(item?.lastPositionAt) || 0,
        progressPercent: normalizeCoursePercent(item?.progressPercent),
        chapters,
        updatedAt: Number(item?.updatedAt) || 0,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.order - right.order)
    .slice(0, 2000);

  const recentSeen = new Set();
  const recent = (Array.isArray(source.recent) ? source.recent : [])
    .map((item) => {
      const url = isAllowedBilibiliUrl(item?.url) ? String(item.url) : '';
      const localPath = normalizeCourseLocalPath(item?.localPath);
      const resourceType = normalizeCourseResourceType(
        item?.resourceType,
        url,
        localPath,
      );
      const key = courseResourceKey({ url, localPath });
      if (
        !key ||
        recentSeen.has(key) ||
        (resourceType === 'bilibili' && !isCourseLearningUrl(url))
      ) {
        return null;
      }
      recentSeen.add(key);
      return {
        title: String(item?.title || '未命名课程').slice(0, 240),
        courseId: String(item?.courseId || '').slice(0, 160),
        chapterId: String(item?.chapterId || '').slice(0, 160),
        resourceType,
        url,
        localPath,
        at: Number(item?.at) || Date.now(),
        lastPositionSeconds: normalizeCoursePositionSeconds(
          item?.lastPositionSeconds,
        ),
        lastPositionDuration: normalizeCoursePositionSeconds(
          item?.lastPositionDuration,
        ),
      };
    })
    .filter(Boolean)
    .slice(0, 12);

  const courseSessions = (Array.isArray(source.courseSessions)
    ? source.courseSessions
    : []
  )
    .map((item) => {
      const url = isAllowedBilibiliUrl(item?.url) ? String(item.url) : '';
      return {
        at: Number(item?.at) || 0,
        title: String(item?.title || '日语网课').slice(0, 240),
        courseId: String(item?.courseId || '').slice(0, 160),
        chapterId: String(item?.chapterId || '').slice(0, 160),
        resourceType:
          item?.resourceType === 'local' || item?.resourceType === 'bilibili'
            ? item.resourceType
            : url
              ? 'bilibili'
              : 'local',
        url,
        localPath: normalizeCourseLocalPath(item?.localPath),
        durationMinutes: normalizeCourseDurationMinutes(
          item?.durationMinutes,
        ),
        completed: item?.completed === true,
        sessionKey: String(item?.sessionKey || '').slice(0, 240),
        positionSeconds: normalizeCoursePositionSeconds(
          item?.positionSeconds,
        ),
      };
    })
    .filter((item) => item.at > 0)
    .slice(0, 2000);

  return {
    schemaVersion: 1,
    favorites,
    recent,
    courseSessions,
    courseSchedule: normalizeCourseSchedule(source.courseSchedule),
    lastUrl: isAllowedBilibiliUrl(source.lastUrl) ? String(source.lastUrl) : '',
    lastTitle: String(source.lastTitle || '').slice(0, 240),
  };
}

function normalizeStudyPlan(value) {
  const source = value && typeof value === 'object' ? value : {};
  const foundationValues = STUDY_FOUNDATIONS.map(([id]) => id);
  const currentLevel = foundationValues.includes(source.currentLevel)
    ? source.currentLevel
    : 'zero';
  const targetLevel = STUDY_TARGET_LEVELS.includes(source.targetLevel)
    ? source.targetLevel
    : 'N5';
  const durationUnit = source.durationUnit === 'weeks' ? 'weeks' : 'months';
  const maxDuration = 156;
  const durationValue = Math.min(
    maxDuration,
    Math.max(1, Number(source.durationValue) || 6),
  );
  const dailyMinutes = STUDY_DAILY_MINUTES.includes(Number(source.dailyMinutes))
    ? Number(source.dailyMinutes)
    : 30;
  const weeklyStudyDays = STUDY_WEEKLY_DAYS.includes(
    Number(source.weeklyStudyDays),
  )
    ? Number(source.weeklyStudyDays)
    : 7;
  const dailyPracticeGroups = normalizePracticeGroupCount(
    source.dailyPracticeGroups,
  );
  const practiceQuestionsPerRound = normalizePracticeQuestionCount(
    source.practiceQuestionsPerRound,
  );
  const dailyCourseTarget = COURSE_DAILY_TARGETS.includes(
    Number(source.dailyCourseTarget),
  )
    ? Number(source.dailyCourseTarget)
    : 1;
  const courseStartDate = normalizeCoursePlanDate(source.courseStartDate);
  const courseTargetDate = normalizeCoursePlanDate(source.courseTargetDate);
  const courseTargetCount = Math.min(
    5000,
    Math.max(0, Math.round(Number(source.courseTargetCount) || 0)),
  );
  const courseDailyMinutes = COURSE_PLAN_MINUTES.includes(
    Number(source.courseDailyMinutes),
  )
    ? Number(source.courseDailyMinutes)
    : 30;
  const courseIntensity = normalizeCourseIntensity(source.courseIntensity);
  const coursePlanConfigured =
    source.coursePlanConfigured === true &&
    Boolean(courseStartDate) &&
    Boolean(courseTargetDate) &&
    courseStartDate <= courseTargetDate &&
    dailyCourseTarget > 0;
  const configured =
    source.configured === true &&
    studyPlanTargetIsValid(currentLevel, targetLevel);
  const startedAt = configured
    ? Number(source.startedAt) || Date.now()
    : 0;
  const targetDate =
    configured && startedAt
      ? startedAt +
        durationValue *
          (durationUnit === 'weeks' ? 7 : 30) *
          DAY_MILLISECONDS
      : 0;
  const courseDays = [
    ...new Set(
      (Array.isArray(source.courseDays) ? source.courseDays : []).filter(
        (day) => /^\d{4}-\d{2}-\d{2}$/.test(String(day)),
      ),
    ),
  ].slice(-60);
  return {
    configured,
    currentLevel,
    targetLevel,
    durationValue,
    durationUnit,
    startedAt,
    targetDate,
    dailyMinutes,
    weeklyStudyDays,
    dailyPracticeGroups,
    practiceQuestionsPerRound,
    dailyCourseTarget,
    coursePlanConfigured,
    courseStartDate,
    courseTargetDate,
    courseTargetCount,
    courseDailyMinutes,
    courseIntensity,
    coursePlanUpdatedAt: Number(source.coursePlanUpdatedAt) || 0,
    courseDays,
    updatedAt: Number(source.updatedAt) || 0,
  };
}

function normalizeStudySecondsByDay(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([day, seconds]) => {
        const amount = Number(seconds);
        return (
          /^\d{4}-\d{2}-\d{2}$/.test(day) &&
          Number.isFinite(amount) &&
          amount > 0
        );
      })
      .slice(-400)
      .map(([day, seconds]) => [
        day,
        Math.min(86400, Math.round(Number(seconds))),
      ]),
  );
}

function normalizePracticeSessions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const startedAt = Number(item.startedAt) || 0;
      if (startedAt <= 0) return null;
      const status = ['active', 'completed', 'abandoned'].includes(item.status)
        ? item.status
        : 'abandoned';
      const plannedCount = Math.min(
        MAX_PRACTICE_QUESTION_COUNT,
        Math.max(0, Math.round(Number(item.plannedCount) || 0)),
      );
      const answeredCount = Math.min(
        plannedCount || MAX_PRACTICE_QUESTION_COUNT,
        Math.max(0, Math.round(Number(item.answeredCount) || 0)),
      );
      const stringList = (list, limit = 50) =>
        (Array.isArray(list) ? list : [])
          .map((entry) => String(entry || '').slice(0, 160))
          .filter(Boolean)
          .slice(0, limit);
      return {
        id:
          String(item.id || '').slice(0, 120) ||
          `practice-${startedAt}-${index}`,
        startedAt,
        endedAt: Number(item.endedAt) || 0,
        completedAt: Number(item.completedAt) || 0,
        at: Number(item.at) || Number(item.endedAt) || startedAt,
        mode: String(item.mode || 'mixed').slice(0, 40),
        stageLevel: String(item.stageLevel || '').slice(0, 20),
        taskKind: String(item.taskKind || '').slice(0, 40),
        status,
        plannedCount,
        answeredCount,
        score: Math.min(
          answeredCount,
          Math.max(0, Math.round(Number(item.score) || 0)),
        ),
        questionIds: stringList(item.questionIds),
        knowledgeIds: stringList(item.knowledgeIds),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.startedAt - left.startedAt)
    .slice(0, 300);
}

function normalizeReviewSchedule(value) {
  const source =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const rawItems =
    source.items && typeof source.items === 'object' && !Array.isArray(source.items)
      ? source.items
      : {};
  const now = Date.now();
  const items = {};
  for (const [key, item] of Object.entries(rawItems)) {
    if (!item || typeof item !== 'object') continue;
    const type = ['word', 'grammar', 'kana'].includes(item.type)
      ? item.type
      : '';
    const id = String(item.id || '').slice(0, 120);
    const exists =
      (type === 'word' && CONTENT_WORD_BY_ID[id]) ||
      (type === 'grammar' && CONTENT_GRAMMAR_BY_ID[id]) ||
      (type === 'kana' && KANA_BY_ID[id]);
    if (!type || !id || !exists) continue;
    const intervalDays = REVIEW_INTERVAL_DAYS.includes(Number(item.intervalDays))
      ? Number(item.intervalDays)
      : 1;
    const normalizedKey = `${type}:${id}`;
    if (normalizedKey !== key) continue;
    items[normalizedKey] = {
      type,
      id,
      masteredAt: Math.max(0, Number(item.masteredAt) || 0),
      lastReviewedAt: Math.max(0, Number(item.lastReviewedAt) || 0),
      nextReviewAt: Math.min(
        now + 365 * DAY_MILLISECONDS,
        Math.max(0, Number(item.nextReviewAt) || 0),
      ),
      intervalDays,
      correctStreak: Math.min(
        999,
        Math.max(0, Math.round(Number(item.correctStreak) || 0)),
      ),
      lapses: Math.min(
        999,
        Math.max(0, Math.round(Number(item.lapses) || 0)),
      ),
      lastResult: ['correct', 'wrong'].includes(item.lastResult)
        ? item.lastResult
        : '',
      source: String(item.source || '').slice(0, 40),
      updatedAt: Math.max(0, Number(item.updatedAt) || 0),
    };
  }
  return { schemaVersion: 1, items };
}

function normalizeTranslationHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const source = String(item.source || '').trim().slice(0, 5000);
      const text = String(item.text || '').trim().slice(0, 8000);
      if (!source || !text) return null;
      const direction = item.direction === 'zh-ja' ? 'zh-ja' : 'ja-zh';
      const at = Number(item.at) || 0;
      return {
        id:
          String(item.id || '').slice(0, 120) ||
          `translation-${at}-${index}`,
        at,
        direction,
        source,
        text,
        provider: String(item.provider || '').slice(0, 120),
        japaneseText:
          direction === 'ja-zh'
            ? source
            : text || String(item.japaneseText || '').slice(0, 8000),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.at - left.at)
    .slice(0, 50);
}

function normalizeOnboarding(value, { existingUser = false } = {}) {
  const source =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const allowedStatuses = new Set([
    'pending',
    'completed',
    'skipped',
    'existing',
  ]);
  const status = allowedStatuses.has(source.status)
    ? source.status
    : existingUser
      ? 'existing'
      : 'pending';
  return {
    schemaVersion: 1,
    status,
    completedAt: Math.max(0, Number(source.completedAt) || 0),
    skippedAt: Math.max(0, Number(source.skippedAt) || 0),
    reminderDismissedAt: Math.max(
      0,
      Number(source.reminderDismissedAt) || 0,
    ),
  };
}

function normalizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object' || raw.__readError) {
    base.onboarding = normalizeOnboarding(null, {
      existingUser: Boolean(raw && raw.__readError),
    });
    return base;
  }
  return {
    ...base,
    ...raw,
    kana: raw.kana && typeof raw.kana === 'object' ? raw.kana : {},
    words: raw.words && typeof raw.words === 'object' ? raw.words : {},
    grammar: raw.grammar && typeof raw.grammar === 'object' ? raw.grammar : {},
    quizzes: Array.isArray(raw.quizzes) ? raw.quizzes : [],
    practiceSessions: normalizePracticeSessions(raw.practiceSessions),
    translationHistory: normalizeTranslationHistory(raw.translationHistory),
    activity: Array.isArray(raw.activity) ? raw.activity : [],
    streak:
      raw.streak && typeof raw.streak === 'object'
        ? { last: raw.streak.last ?? null, days: Number(raw.streak.days) || 0 }
        : { last: null, days: 0 },
    stats: {
      answered: Number(raw.stats?.answered) || 0,
      correct: Number(raw.stats?.correct) || 0,
    },
    studySecondsByDay: normalizeStudySecondsByDay(raw.studySecondsByDay),
    onboarding: normalizeOnboarding(raw.onboarding, { existingUser: true }),
    studyPlan: normalizeStudyPlan(raw.studyPlan),
    reviewSchedule: normalizeReviewSchedule(raw.reviewSchedule),
    webCourses: normalizeWebCourses(raw.webCourses),
  };
}

async function loadState() {
  try {
    const raw = await bridge.loadState();
    state = normalizeState(raw);
    abandonInterruptedPracticeSessions();
    if (raw && raw.__readError) toast('学习记录读取失败，已使用空白记录');
  } catch (error) {
    console.error('加载学习记录失败', error);
    state = defaultState();
    state.onboarding = normalizeOnboarding(
      { status: 'existing' },
      { existingUser: true },
    );
    toast('学习记录读取失败，已使用空白记录');
  }
}

function scheduleSave() {
  setSaveStatus('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 350);
}

async function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    await bridge.saveState(state);
    lastSavedAt = Date.now();
    setSaveStatus('saved');
    return true;
  } catch (error) {
    console.error('保存学习记录失败', error);
    setSaveStatus('error');
    return false;
  }
}

function touchStreak() {
  const today = todayKey();
  if (state.streak.last === today) return;
  const yesterday = todayKey(-24 * 60 * 60 * 1000);
  state.streak.days =
    state.streak.last === yesterday ? (state.streak.days || 0) + 1 : 1;
  state.streak.last = today;
}

function recordActivity(type, title) {
  touchStreak();
  state.activity.unshift({ type, title, at: Date.now() });
  state.activity = state.activity.slice(0, 12);
}

function recommendedRoute() {
  const metrics = studyPlanMetrics();
  if (metrics) {
    if (
      metrics.plan.currentLevel === 'zero' &&
      countToday(state.kana) < 5 &&
      learnedKanaCount() < KANA_TOTAL
    ) {
      return 'kana';
    }
    const plannedWordsToday = countTodayForIds(
      state.words,
      metrics.wordPool.map((word) => word.id),
    );
    const plannedGrammarToday = countTodayForIds(
      state.grammar,
      metrics.grammarPool.map((lesson) => lesson.id),
      'at',
    );
    if (plannedWordsToday < metrics.wordTarget) return 'words';
    if (plannedGrammarToday < metrics.grammarTarget) return 'grammar';
    const quizToday = practiceCountForDate(todayKey());
    if (quizToday < metrics.practiceGroups) return 'quiz';
    if (
      courseSessionCountForDate(todayKey()) <
      metrics.dailyCourseTarget
    ) {
      return 'courses';
    }
    return 'quiz';
  }
  if (learnedKanaCount() < 20) return 'kana';
  if (masteredWordCount() < 20) return 'words';
  if (completedGrammarCount() < 3) return 'grammar';
  return 'quiz';
}

function renderNav() {
  const counts = {
    kana: `${learnedKanaCount()}/${KANA_TOTAL}`,
    words: `${masteredWordCount()}/${WORD_TOTAL}`,
    grammar: `${completedGrammarCount()}/${GRAMMAR_TOTAL}`,
    quiz: state.quizzes.length ? `${state.quizzes.length} 组` : '',
    courses: state.webCourses.favorites.length
      ? `${state.webCourses.favorites.length} 收藏`
      : '',
    data: `${overallPercent()}%`,
  };
  els.nav.innerHTML = NAV_ITEMS.map((item) => {
    const active = ui.route === item.id;
    return `
      <button class="nav-item${active ? ' active' : ''}" type="button"
        data-action="navigate" data-route="${item.id}"
        ${active ? 'aria-current="page"' : ''}>
        <span class="nav-icon" aria-hidden="true">${item.icon}</span>
        <span class="nav-label">${item.label}</span>
        <span class="nav-count">${counts[item.id] ?? ''}</span>
      </button>`;
  }).join('');
}

function updateTopbar() {
  const meta = ROUTE_META[ui.route] ?? ROUTE_META.home;
  els.eyebrow.textContent = meta.eyebrow;
  els.pageTitle.textContent = meta.title;
  els.stagePill.textContent = stageLabel();
  els.dateText.textContent = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
}

function render(preserveScroll = false) {
  const scrollTop = els.view.scrollTop;
  renderNav();
  updateTopbar();
  let html = '';
  if (ui.route === 'kana') html = renderKana();
  else if (ui.route === 'words') html = renderWords();
  else if (ui.route === 'grammar') html = renderGrammar();
  else if (ui.route === 'quiz') html = renderQuiz();
  else if (ui.route === 'courses') html = renderCourse();
  else if (ui.route === 'translate') html = renderTranslate();
  else if (ui.route === 'data') html = renderData();
  else html = renderHome();
  els.view.innerHTML = html;
  els.view.classList.toggle('course-mode', ui.route === 'courses');
  els.view.scrollTop = preserveScroll ? scrollTop : 0;
  if (ui.route === 'data') refreshAudioOutputDevices();
  if (ui.route === 'data') refreshMobileBackupInfo();
  scheduleCourseBrowserSync();
}

function go(route) {
  if (!ROUTE_META[route]) return;
  if (ui.route !== route) stopMobileSpeechPlayback();
  if (route !== 'quiz') abandonCurrentPracticeSession();
  ui.route = route;
  if (route === 'grammar') {
    ui.lessonId = null;
    ui.grammarPage = 1;
  }
  if (route === 'quiz') {
    abandonCurrentPracticeSession();
    ui.quiz = null;
  }
  if (route === 'words') ui.wordPage = 1;
  render();
}

function buildDailyTaskPlan(planMetrics = studyPlanMetrics()) {
  const kanaToday = countToday(state.kana);
  const quizToday = practiceCountForDate(todayKey());
  const courseToday = courseSessionCountForDate(todayKey());
  const reviewedTodayKeys = reviewedKnowledgeKeysSince(
    new Date(`${todayKey()}T00:00:00`).getTime(),
  );
  const scheduledCoursesToday = state.studyPlan.coursePlanConfigured
    ? courseScheduleEntriesWithState().filter(
        (item) => item.date === todayKey(),
      ).length
    : 0;
  const effectiveCourseTarget = state.studyPlan.coursePlanConfigured
    ? scheduledCoursesToday
    : planMetrics
      ? state.studyPlan.dailyCourseTarget || 0
      : 0;
  if (!planMetrics) {
    if (!effectiveCourseTarget) return [];
    return [
      {
        id: 'courses',
        title: `完成 ${effectiveCourseTarget} 节网课`,
        meta: `今天 ${Math.min(courseToday, effectiveCourseTarget)}/${effectiveCourseTarget} 节 · 独立网课计划`,
        level: '',
        done: courseToday >= effectiveCourseTarget,
      },
    ];
  }
  const plannedWordsToday = countTodayForIds(
    state.words,
    planMetrics.focusWordPool.map((word) => word.id),
  );
  const plannedGrammarToday = countTodayForIds(
    state.grammar,
    planMetrics.focusGrammarPool.map((lesson) => lesson.id),
    'at',
  );
  const rounds = practiceRoundPlan(planMetrics);
  const nextRound = nextPracticeRound(rounds);
  const reviewTarget = Math.min(10, planMetrics.reviewDueCount);
  const reviewBatch = planMetrics.dueReviewItems.slice(0, reviewTarget);
  const reviewedDueToday = reviewBatch.filter((item) =>
    reviewedTodayKeys.has(item.key),
  ).length;
  const stageTest = planMetrics.stageTest;
  const stageTestCount = Math.min(
    15,
    Math.max(10, planMetrics.practiceQuestionCount),
  );
  return [
    ...(reviewTarget > 0
      ? [
          {
            id: 'review',
            title: `优先完成 ${reviewTarget} 个间隔复习`,
            meta: `今天 ${Math.min(reviewedDueToday, reviewTarget)}/${reviewTarget} · 按遗忘风险和到期时间排序`,
            level: planMetrics.focusLevel,
            route: 'quiz',
            mode: 'spaced',
            count: reviewTarget,
            done: reviewedDueToday >= reviewTarget,
          },
        ]
      : []),
    ...(planMetrics.kanaDailyTarget > 0
      ? [
          {
            id: 'kana',
            title: `学习 ${planMetrics.kanaDailyTarget} 个新假名`,
            meta: `今天 ${Math.min(kanaToday, planMetrics.kanaDailyTarget)}/${planMetrics.kanaDailyTarget} · 发音与识别`,
            level: '',
            done: kanaToday >= planMetrics.kanaDailyTarget,
          },
        ]
      : []),
    ...(planMetrics.wordTarget > 0
      ? [
          {
            id: 'words',
            title: `掌握 ${planMetrics.wordTarget} 个 ${planMetrics.focusLevel} 词汇`,
            meta: `今天 ${Math.min(plannedWordsToday, planMetrics.wordTarget)}/${planMetrics.wordTarget} · 本级剩余 ${planMetrics.focusRemainingWords} 个`,
            level: planMetrics.focusLevel,
            done: plannedWordsToday >= planMetrics.wordTarget,
          },
        ]
      : []),
    ...(planMetrics.grammarTarget > 0
      ? [
          {
            id: 'grammar',
            title: `完成 ${planMetrics.grammarTarget} 个 ${planMetrics.focusLevel} 语法点`,
            meta: `今天 ${Math.min(plannedGrammarToday, planMetrics.grammarTarget)}/${planMetrics.grammarTarget} · 本级剩余 ${planMetrics.focusRemainingGrammar} 个`,
            level: planMetrics.focusLevel,
            done: plannedGrammarToday >= planMetrics.grammarTarget,
          },
        ]
      : []),
    ...(stageTest?.due
      ? [
          {
            id: 'stage-test',
            title: stageTest.title,
            meta:
              stageTest.latestRate === null
                ? `用现有题目检查当前阶段 · 共 ${stageTestCount} 题`
                : `上次正确率 ${Math.round(stageTest.latestRate * 100)}% · 建议再次检查`,
            level: planMetrics.focusLevel,
            route: 'quiz',
            mode: 'stage-test',
            count: stageTestCount,
            done: stageTest.doneToday,
          },
        ]
      : []),
    {
      id: 'quiz',
      title: `分 ${rounds.length} 轮完成练习`,
      meta: `今天 ${Math.min(quizToday, rounds.length)}/${rounds.length} 轮 · 下一轮：${nextRound.title.replace(/^第 \d+ 轮 · /, '')}`,
      level: planMetrics.focusLevel,
      done: quizToday >= rounds.length,
    },
    ...(effectiveCourseTarget
      ? [
          {
            id: 'courses',
            title: `完成 ${effectiveCourseTarget} 节网课`,
            meta: `今天 ${Math.min(courseToday, effectiveCourseTarget)}/${effectiveCourseTarget} 节 · 本周 ${courseSessionCountThisWeek()}/${planMetrics.courseWeeklyTarget}`,
            done: courseToday >= effectiveCourseTarget,
          },
        ]
      : []),
  ];
}

function renderHome() {
  const percent = overallPercent();
  const kanaToday = countToday(state.kana);
  const wordsToday = countToday(state.words);
  const grammarToday = countToday(state.grammar);
  const quizToday = practiceCountForDate(todayKey());
  const accuracy = quizAccuracy();
  const streak = currentStudyStreak();
  const planMetrics = studyPlanMetrics();
  const currentPlan = planMetrics?.plan || state.studyPlan;
  const plannedWordsToday = planMetrics
    ? countTodayForIds(
        state.words,
        planMetrics.focusWordPool.map((word) => word.id),
      )
    : wordsToday;
  const plannedGrammarToday = planMetrics
    ? countTodayForIds(
        state.grammar,
        planMetrics.focusGrammarPool.map((lesson) => lesson.id),
        'at',
      )
    : grammarToday;

  const heroTitle =
    percent === 0
      ? '从第一音开始'
      : percent < 30
        ? '把基础打扎实'
        : percent < 70
          ? '语感正在形成'
          : '向更高的等级迈进';

  const tasks = buildDailyTaskPlan(planMetrics);
  const weeklyProgress = currentWeekTaskProgress(planMetrics);
  const rounds = practiceRoundPlan(planMetrics);
  const wrongItems = storedWrongQuestions();
  const courseToday = courseSessionCountForDate(todayKey());
  const tasksDone = tasks.filter((task) => task.done).length;
  const deadlineText =
    planMetrics?.plan.targetDate
      ? new Intl.DateTimeFormat('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }).format(new Date(planMetrics.plan.targetDate))
      : '未设置';

  const modules = [
    { id: 'kana', icon: 'あ', name: '五十音图', meta: `${learnedKanaCount()}/${KANA_TOTAL} 已掌握` },
    { id: 'words', icon: '語', name: '核心词汇', meta: `${masteredWordCount()}/${WORD_TOTAL} 已掌握` },
    { id: 'grammar', icon: '文', name: '基础语法', meta: `${completedGrammarCount()}/${GRAMMAR_TOTAL} 已完成` },
    { id: 'quiz', icon: '試', name: '随机测验', meta: state.quizzes.length ? `已完成 ${state.quizzes.length} 组` : '50 音 · 词汇 · 语法' },
    {
      id: 'courses',
      icon: '講',
      name: '网课打卡',
      meta: state.webCourses.favorites.length
        ? `已收藏 ${state.webCourses.favorites.length} 个课程`
        : '手动记录课程与每日打卡',
    },
  ];

  const recent = state.activity.slice(0, 6);

  return `
    <div class="page">
      <section class="hero-card">
        <div>
          <div class="hero-kicker">${streak > 0 ? `连续学习 ${streak} 天` : 'Sakura'}</div>
          <h2 class="hero-title">${greeting()}，${heroTitle}</h2>
          <p class="hero-text">
            从五十音到基础句型，按自己的节奏积累。每天一点点，听、读、记在这里连成一条线。
          </p>
          <div class="hero-actions">
            <button class="primary-button" type="button" data-action="navigate" data-route="${recommendedRoute()}">
              继续学习
            </button>
            <button class="secondary-button" type="button" data-action="navigate" data-route="quiz">
              做一组测验
            </button>
          </div>
        </div>
        <div class="hero-progress">
          <div class="progress-label"><span>总进度</span><strong>${percent}%</strong></div>
          <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
          <p class="progress-hint">
            已掌握 ${learnedKanaCount()} 个假名 · ${masteredWordCount()} 个词汇 · ${completedGrammarCount()} 个语法点
          </p>
        </div>
      </section>

      <nav class="mobile-quick-grid" aria-label="手机常用学习入口">
        <button type="button" data-action="navigate" data-route="kana">
          <span aria-hidden="true">あ</span><strong>五十音</strong>
        </button>
        <button type="button" data-action="navigate" data-route="words">
          <span aria-hidden="true">語</span><strong>词汇</strong>
        </button>
        <button type="button" data-action="navigate" data-route="grammar">
          <span aria-hidden="true">文</span><strong>语法</strong>
        </button>
        <button type="button" data-action="navigate" data-route="quiz">
          <span aria-hidden="true">試</span><strong>练习</strong>
        </button>
        <button type="button" data-action="navigate" data-route="translate">
          <span aria-hidden="true">訳</span><strong>翻译</strong>
        </button>
        <button type="button" data-action="navigate" data-route="courses">
          <span aria-hidden="true">講</span><strong>网课</strong>
        </button>
      </nav>

      <div class="stat-row">
        <div class="stat-card">
          <div class="stat-value">${learnedKanaCount()}<span>/ ${KANA_TOTAL}</span></div>
          <div class="stat-label">已掌握假名</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${masteredWordCount()}<span>/ ${WORD_TOTAL}</span></div>
          <div class="stat-label">已掌握词汇</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${completedGrammarCount()}<span>/ ${GRAMMAR_TOTAL}</span></div>
          <div class="stat-label">完成语法点</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${accuracy === null ? '—' : `${accuracy}<span>%</span>`}</div>
          <div class="stat-label">测验正确率</div>
        </div>
      </div>

      <section class="study-plan-card${planMetrics ? '' : ' empty'}">
        ${
          planMetrics
            ? `
          <div class="study-plan-main">
            <div class="study-plan-kicker">长期目标 · PERSONAL PLAN</div>
            <h2>${esc(studyFoundationLabel(planMetrics.plan.currentLevel))} → ${esc(planMetrics.plan.targetLevel)}</h2>
            <div class="study-plan-stage">
              <strong>${esc(planMetrics.stage.title)}</strong>
              <span>${esc(planMetrics.stage.detail)}</span>
            </div>
            <p>
              ${planMetrics.expired ? '计划已到期' : `${planMetrics.remainingCalendarDays} 天后截止`} · 截止日期 ${esc(deadlineText)}
              · 每周 ${planMetrics.weeklyStudyDays} 天 · 每次约 ${planMetrics.plan.dailyMinutes} 分钟
            </p>
            <div class="study-plan-progress">
              ${
                planMetrics.kanaDailyTarget
                  ? `<span>五十音 ${planMetrics.learnedKana}/${KANA_TOTAL}</span>`
                  : ''
              }
              <span>目标范围词汇 ${planMetrics.masteredWords}/${planMetrics.wordPool.length}</span>
              <span>语法 ${planMetrics.completedGrammar}/${planMetrics.grammarPool.length}</span>
              <span>剩余学习日 ${planMetrics.remainingStudyDays} 天</span>
            </div>
            <div class="study-roadmap" aria-label="分阶段学习路线">
              ${planMetrics.roadmap
                .map(
                  (item) => `
                  <span class="study-roadmap-step ${item.status}">
                    <b>${esc(item.title)}</b>
                    <small>${item.progressPercent}%</small>
                  </span>`,
                )
                .join('')}
            </div>
            <div class="study-review-summary">
              <div>
                <span>间隔复习</span>
                <strong>${planMetrics.reviewDueCount} 个到期 · 本周已复习 ${planMetrics.reviewedThisWeek} 个</strong>
                <small>${
                  planMetrics.dueReviewItems.length
                    ? planMetrics.dueReviewItems
                        .slice(0, 3)
                        .map((item) => esc(item.label))
                        .join(' · ')
                    : '当前没有到期复习'
                }</small>
              </div>
              <div>
                <span>阶段测试</span>
                <strong>${
                  planMetrics.stageTest?.latestRate === null ||
                  planMetrics.stageTest?.latestRate === undefined
                    ? '尚未测试'
                    : `上次 ${Math.round(planMetrics.stageTest.latestRate * 100)}%`
                }</strong>
                <small>${
                  planMetrics.stageTest?.doneThisWeek
                    ? '本周已完成'
                    : planMetrics.stageTest?.ready
                      ? '已可安排当前阶段测试'
                      : '阶段进度达到 50% 后建议测试'
                }</small>
              </div>
            </div>
          </div>
          <div class="study-plan-time">
            <span class="study-plan-time-title">每日任务时间建议</span>
            <div class="study-plan-time-grid">
              ${
                planMetrics.kanaMinutes
                  ? `<span><strong>${planMetrics.kanaMinutes}</strong>分钟假名与发音</span>`
                  : ''
              }
              ${
                planMetrics.wordMinutes
                  ? `<span><strong>${planMetrics.wordMinutes}</strong>分钟词汇</span>`
                  : ''
              }
              ${
                planMetrics.grammarMinutes
                  ? `<span><strong>${planMetrics.grammarMinutes}</strong>分钟语法</span>`
                  : ''
              }
              <span><strong>${planMetrics.practiceMinutes}</strong>分钟练习</span>
            </div>
            <p>
              网课：${planMetrics.courseFrequency}，每次约 ${planMetrics.courseMinutes} 分钟。
              今天 ${Math.min(courseToday, planMetrics.dailyCourseTarget)}/${planMetrics.dailyCourseTarget} 节，
              本周 ${planMetrics.recentCourseSessions}/${planMetrics.courseWeeklyTarget} 节。
            </p>
            <div class="study-plan-actions">
              <button class="small-button" type="button" data-action="study-plan-open">修改计划</button>
              <button class="small-button" type="button" data-action="study-plan-course">去记录网课</button>
              ${
                planMetrics.dailyCourseTarget
                  ? `<button class="small-button" type="button" data-action="study-plan-course-done"
                      ${courseToday >= planMetrics.dailyCourseTarget ? 'disabled' : ''}>
                      ${courseToday >= planMetrics.dailyCourseTarget
                        ? '今日网课已完成'
                        : `记录一节网课 ${Math.min(courseToday, planMetrics.dailyCourseTarget)}/${planMetrics.dailyCourseTarget}`}
                    </button>`
                  : ''
              }
            </div>
          </div>
          ${
            planMetrics.paceFeasible
              ? ''
              : `<p class="study-plan-warning">按每周 ${planMetrics.weeklyStudyDays} 天、每次 ${planMetrics.plan.dailyMinutes} 分钟，预计需要约 ${planMetrics.estimatedCalendarDays} 个自然日；想按期完成，建议每次约 ${planMetrics.suggestedDailyMinutes} 分钟，或延长截止时间。</p>`
          }${
            planMetrics.paceAdjustment?.behind
              ? `<p class="study-plan-warning">${esc(planMetrics.paceAdjustment.message)}</p>`
              : ''
          }`
            : `
          <div class="study-plan-main">
            <div class="study-plan-kicker">PERSONAL PLAN</div>
            <h2>先确定你的学习目标</h2>
            <p>告诉我你目前的基础、目标等级、计划用多久完成，以及每天能学习多久。每日任务和练习量会随计划自动调整。</p>
          </div>
          <div class="study-plan-actions">
            <button class="primary-button" type="button" data-action="study-plan-open">设置学习计划</button>
          </div>`
        }
      </section>

      <div class="learning-rhythm-grid">
        <section class="panel weekly-plan-panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">周计划 · 本周任务</h3>
              <p class="panel-note">从本周一到今天，按真实学习记录统计</p>
            </div>
            <span class="rhythm-badge">${
              weeklyProgress.tasks.length
                ? `${weeklyProgress.tasks.filter((task) => task.completed).length}/${weeklyProgress.tasks.length}`
                : '自由学习'
            }</span>
          </div>
          <div class="weekly-task-list">
            ${
              weeklyProgress.tasks.length
                ? weeklyProgress.tasks
                    .map(
                      (task) => `
                <button class="weekly-task-item" type="button"
                  data-action="${task.mode ? 'quiz-start' : 'navigate'}"
                  data-route="${task.route}"
                  data-mode="${esc(task.mode || '')}"
                  data-count="${Number(task.count) || ''}"
                  data-level="${esc(task.level || '')}">
                  <span class="weekly-task-copy">
                    <strong>${esc(task.title)}</strong>
                    <span class="weekly-task-track">
                      <i style="width:${Math.min(100, Math.round((task.done / Math.max(1, task.target)) * 100))}%"></i>
                    </span>
                  </span>
                  <span class="weekly-task-value${task.completed ? ' completed' : ''}">
                    ${task.completed ? '✓ ' : ''}${task.done}/${task.target}
                  </span>
                </button>`,
                    )
                    .join('')
                : `<div class="quiz-review-empty">设置学习计划后，这里会按真实记录生成本周目标。</div>`
            }
          </div>
        </section>

        <section class="panel practice-rhythm-panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">今天的多轮练习</h3>
              <p class="panel-note">同一知识点至少换一种方式提取，错题在答对前持续保留</p>
            </div>
            <button class="primary-button" type="button" data-action="quiz-round-next">
              下一轮 ${nextPracticeRound(rounds).count} 题
            </button>
          </div>
          <div class="practice-round-list">
            ${rounds
              .map(
                (round) => `
                <button class="practice-round-card${round.completed ? ' completed' : ''}"
                  type="button" data-action="quiz-start" data-mode="${round.mode}"
                  data-count="${round.count}">
                  <span class="practice-round-number">${round.completed ? '✓' : round.index + 1}</span>
                  <span class="practice-round-copy">
                    <strong>${esc(round.title)}</strong>
                    <small>${esc(round.detail)}</small>
                  </span>
                  <span class="practice-round-meta">${round.minutes} 分钟</span>
                </button>`,
              )
              .join('')}
          </div>
        </section>

        <section class="panel wrong-book-panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">错题本</h3>
              <p class="panel-note">复习答对后自动移出，答错则继续保留</p>
            </div>
            <span class="rhythm-badge">${wrongItems.length} 个</span>
          </div>
          ${
            wrongItems.length
              ? `<div class="wrong-book-list">
                  ${wrongItems
                    .slice(0, 4)
                    .map(
                      (item) => `
                      <div class="wrong-book-item">
                        <strong>${esc(item.knowledgeLabel || item.prompt)}</strong>
                        <span>${esc(item.correct || '')}</span>
                      </div>`,
                    )
                    .join('')}
                </div>
                <div class="wrong-book-actions">
                  <button class="primary-button" type="button"
                    data-action="quiz-start" data-mode="review"
                    data-count="${Math.min(10, wrongItems.length)}">
                    复习 ${Math.min(10, wrongItems.length)} 题
                  </button>
                  <button class="small-button" type="button"
                    data-action="navigate" data-route="quiz">查看全部</button>
                </div>`
              : `<div class="quiz-review-empty">目前没有待复习错题。练习中答错的知识点会自动进入这里。</div>`
          }
        </section>
      </div>

      <div class="home-dashboard-grid">
        ${renderHomeCalendar()}

        <section class="panel tasks-panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">每日任务</h3>
              <p class="panel-note">${
                tasks.length
                  ? `完成 ${tasksDone}/${tasks.length} 项 · ${
                      planMetrics
                        ? `当前阶段 ${esc(planMetrics.stage.title)}`
                        : '独立网课计划'
                    } · 未完成任务会按最新进度重算，不会逐日累加`
                  : '尚未设置计划，你可以继续自由学习或随时创建计划'
              }</p>
            </div>
            <button class="link-button" type="button" data-action="navigate" data-route="quiz">去测验</button>
          </div>
          <div class="task-list">
            ${
              tasks.length
                ? tasks
                    .map(
                      (task) => `
              <div class="task-item${task.done ? ' done' : ''}">
                <span class="task-check" aria-hidden="true">${task.done ? '✓' : ''}</span>
                <div class="task-copy">
                  <div class="task-title">${task.title}</div>
                  <div class="task-meta">${task.meta}</div>
                </div>
                <button class="task-go" type="button"
                  data-action="${task.mode ? 'quiz-start' : 'navigate'}"
                  data-route="${task.route || task.id}"
                  data-mode="${esc(task.mode || '')}"
                  data-count="${Number(task.count) || ''}"
                  data-level="${esc(task.level || '')}"
                  aria-label="前往${task.title}">›</button>
              </div>`,
                    )
                    .join('')
                : `<div class="quiz-review-empty">还没有个性化每日任务。点击上方“设置学习计划”即可生成。</div>`
            }
          </div>
        </section>

        <section class="panel modules-panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">学习模块</h3>
              <p class="panel-note">学习与网课入口，随时切换</p>
            </div>
          </div>
          <div class="module-grid">
            ${modules
              .map(
                (module) => `
              <button class="module-card" type="button" data-action="navigate" data-route="${module.id}">
                <span class="module-icon" aria-hidden="true">${module.icon}</span>
                <span class="module-copy">
                  <span class="module-name">${module.name}</span>
                  <span class="module-meta">${module.meta}</span>
                </span>
                <span class="module-arrow" aria-hidden="true">›</span>
              </button>`,
              )
              .join('')}
          </div>
        </section>

        <section class="panel recent-panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">最近学习</h3>
              <p class="panel-note">最近的掌握记录会出现在这里</p>
            </div>
          </div>
          ${
            recent.length
              ? `<div class="recent-list">
                  ${recent
                    .map(
                      (item) => `
                    <div class="recent-item">
                      <span class="recent-dot"></span>
                      <div class="recent-copy">
                        <div class="recent-title">${esc(item.title)}</div>
                        <div class="recent-time">${relativeTime(item.at)}</div>
                      </div>
                    </div>`,
                    )
                    .join('')}
                </div>`
              : `<div class="empty"><div class="empty-mark">あ</div>还没有学习记录，从五十音开始吧。</div>`
          }
        </section>
      </div>
    </div>`;
}

function readStudyPlanDraft() {
  const currentLevel =
    document.getElementById('study-current-level')?.value || 'zero';
  const targetLevel =
    document.getElementById('study-target-level')?.value || 'N5';
  if (!studyPlanTargetIsValid(currentLevel, targetLevel)) {
    return {
      error:
        currentLevel === 'N1'
          ? '请选择 N1 巩固或重新确认当前基础'
          : '目标等级需要高于当前基础',
    };
  }
  const durationUnit =
    document.getElementById('study-duration-unit')?.value === 'weeks'
      ? 'weeks'
      : 'months';
  const maxDuration = 156;
  const durationValue = Math.min(
    maxDuration,
    Math.max(
      1,
      Math.round(
        Number(document.getElementById('study-duration-value')?.value) || 6,
      ),
    ),
  );
  const dailyValue = Number(
    document.getElementById('study-daily-minutes')?.value,
  );
  const dailyMinutes = STUDY_DAILY_MINUTES.includes(dailyValue)
    ? dailyValue
    : 30;
  const weeklyValue = Number(
    document.getElementById('study-weekly-days')?.value,
  );
  const weeklyStudyDays = STUDY_WEEKLY_DAYS.includes(weeklyValue)
    ? weeklyValue
    : 7;
  const practiceGroupsField = document.getElementById(
    'study-daily-practice-groups',
  );
  const dailyPracticeGroups = practiceGroupsField
    ? normalizePracticeGroupCount(practiceGroupsField.value)
    : normalizePracticeGroupCount(state.studyPlan.dailyPracticeGroups);
  const practiceQuestionField = document.getElementById(
    'study-practice-question-count',
  );
  const practiceQuestionsPerRound = practiceQuestionField
    ? normalizePracticeQuestionCount(practiceQuestionField.value)
    : normalizePracticeQuestionCount(
        state.studyPlan.practiceQuestionsPerRound,
      );
  const courseValue = Number(
    document.getElementById('study-daily-courses')?.value,
  );
  const dailyCourseTarget = COURSE_DAILY_TARGETS.includes(courseValue)
    ? courseValue
    : state.studyPlan.dailyCourseTarget || 0;
  const now = Date.now();
  return {
    error: '',
    plan: {
      ...state.studyPlan,
      configured: true,
      currentLevel,
      targetLevel,
      durationValue,
      durationUnit,
      startedAt: now,
      targetDate:
        now +
        durationValue *
          (durationUnit === 'weeks' ? 7 : 30) *
          DAY_MILLISECONDS,
      dailyMinutes,
      weeklyStudyDays,
      dailyPracticeGroups,
      practiceQuestionsPerRound,
      dailyCourseTarget,
      courseDays: state.studyPlan.courseDays,
      updatedAt: now,
    },
  };
}

function updateStudyPlanPreview() {
  const preview = document.getElementById('study-plan-preview');
  if (!preview) return;
  const draft = readStudyPlanDraft();
  if (draft.error) {
    preview.className = 'study-plan-live-preview warning';
    preview.innerHTML = `<strong>计划需要调整</strong><p>${esc(draft.error)}</p>`;
    return;
  }
  const metrics = calculateStudyPlanMetrics(draft.plan);
  if (!metrics) return;
  const range = metrics.levels.join('、');
  preview.className = `study-plan-live-preview${metrics.paceFeasible ? '' : ' warning'}`;
  preview.innerHTML = `
    <strong>${metrics.paceFeasible ? '当前计划可行' : '当前目标偏紧'}</strong>
    <p>长期目标：${esc(studyFoundationLabel(metrics.plan.currentLevel))} → ${esc(metrics.plan.targetLevel)}；当前阶段：${esc(metrics.stage.title)}。</p>
    <p>目标范围：${esc(range)} · 剩余词汇 ${metrics.remainingWords} 个 · 剩余语法 ${metrics.remainingGrammar} 个</p>
    <p>剩余 ${metrics.remainingCalendarDays} 个自然日，按每周 ${metrics.weeklyStudyDays} 天计算，共约 ${metrics.remainingStudyDays} 个学习日。</p>
    <p>${
      metrics.kanaDailyTarget
        ? `当前先学习 ${metrics.kanaDailyTarget} 个假名`
        : `当前阶段每个学习日约 ${metrics.wordTarget} 个词、${metrics.grammarTarget} 个语法`
    }；练习 ${metrics.practiceGroups} 轮，每轮 ${metrics.practiceQuestionCount} 题。</p>
    <p>每天网课 ${metrics.dailyCourseTarget} 节，本周目标 ${metrics.courseWeeklyTarget} 节。</p>
    <p>${
      metrics.paceFeasible
        ? `按当前设置预计约 ${metrics.estimatedCalendarDays} 个自然日完成。`
        : `按当前设置预计需要约 ${metrics.estimatedCalendarDays} 个自然日；建议每次约 ${metrics.suggestedDailyMinutes} 分钟，或延长期限。`
    }</p>`;
}

function openStudyPlanEditor(mode = 'edit') {
  const plan = state.studyPlan;
  const onboarding = mode === 'onboarding';
  const selectedTarget = studyPlanTargetIsValid(
    plan.currentLevel,
    plan.targetLevel,
  )
    ? plan.targetLevel
    : suggestedTargetForFoundation(plan.currentLevel);
  openModal(`
    ${
      onboarding
        ? `<div class="study-onboarding-note">
            <span>SAKURA START</span>
            <strong>先告诉我你的起点，之后每一天都可以调整</strong>
            <p>计划会把长期目标拆成阶段、周和每日任务。暂时不想设置也可以跳过，词汇、语法、练习和网课仍可正常使用。</p>
          </div>`
        : ''
    }
    <h3>${onboarding ? '制定你的第一份学习计划' : '设置学习计划'}</h3>
    <p>根据当前本地词库和真实学习记录计算任务。JLPT 等级仅作为备考范围，不代表官方固定清单。</p>
    <div class="study-plan-form">
      <label>你目前的基础
        <select id="study-current-level">
          ${STUDY_FOUNDATIONS.map(
            ([value, label]) =>
              `<option value="${value}"${value === plan.currentLevel ? ' selected' : ''}>${label}</option>`,
          ).join('')}
        </select>
      </label>
      <label>你想达到的目标
        <select id="study-target-level">
          ${STUDY_TARGET_LEVELS.map(
            (level) =>
              `<option value="${level}"${level === selectedTarget ? ' selected' : ''}>JLPT ${level}</option>`,
          ).join('')}
        </select>
      </label>
      <label>计划用多久完成
        <span class="study-duration-fields">
          <input id="study-duration-value" type="number" min="1" max="156"
            value="${plan.durationValue}" aria-label="计划时长数字" />
          <select id="study-duration-unit" aria-label="计划时长单位">
            ${STUDY_DURATION_UNITS.map(
              ([value, label]) =>
                `<option value="${value}"${value === plan.durationUnit ? ' selected' : ''}>${label}</option>`,
            ).join('')}
          </select>
        </span>
      </label>
      <label>每天可学习多久
        <select id="study-daily-minutes">
          ${STUDY_DAILY_MINUTES.map(
            (minutes) =>
              `<option value="${minutes}"${minutes === plan.dailyMinutes ? ' selected' : ''}>${minutes} 分钟</option>`,
          ).join('')}
        </select>
      </label>
      <label>每周计划学习几天
        <select id="study-weekly-days">
          ${STUDY_WEEKLY_DAYS.map(
            (days) =>
              `<option value="${days}"${days === (plan.weeklyStudyDays || 7) ? ' selected' : ''}>${days} 天</option>`,
          ).join('')}
        </select>
      </label>
    </div>
    <details class="study-plan-advanced" ${onboarding ? '' : 'open'}>
      <summary>练习与网课设置</summary>
      <div class="study-plan-form">
        <label>每天练习多少轮
          <select id="study-daily-practice-groups">
            <option value="0"${normalizePracticeGroupCount(plan.dailyPracticeGroups) ? '' : ' selected'}>按学习时间自动</option>
            ${PRACTICE_GROUP_OPTIONS.map(
              (count) =>
                `<option value="${count}"${normalizePracticeGroupCount(plan.dailyPracticeGroups) === count ? ' selected' : ''}>${count} 轮</option>`,
            ).join('')}
          </select>
        </label>
        <label>每轮练习多少题
          <select id="study-practice-question-count">
            <option value="0"${normalizePracticeQuestionCount(plan.practiceQuestionsPerRound) ? '' : ' selected'}>按学习时间自动</option>
            ${PRACTICE_QUESTION_OPTIONS.map(
              (count) =>
                `<option value="${count}"${normalizePracticeQuestionCount(plan.practiceQuestionsPerRound) === count ? ' selected' : ''}>${count} 题</option>`,
            ).join('')}
          </select>
        </label>
        <label>每天计划上网课
          <select id="study-daily-courses">
            ${COURSE_DAILY_TARGETS.map(
              (count) =>
                `<option value="${count}"${count === (plan.dailyCourseTarget || 0) ? ' selected' : ''}>${count ? `${count} 节` : '不设网课任务'}</option>`,
            ).join('')}
          </select>
        </label>
      </div>
    </details>
    <div id="study-plan-preview" class="study-plan-live-preview">
      <strong>正在计算计划</strong>
      <p>调整基础、目标、期限和学习时间后会实时显示建议。</p>
    </div>
    <p class="panel-note">保存后会从今天重新计算截止日期。每日任务会按剩余词量、语法量和可用时间自动调整。</p>
    <div class="modal-actions">
      <button class="secondary-button" type="button"
        data-action="${onboarding ? 'study-plan-skip' : 'modal-cancel'}">
        ${onboarding ? '稍后设置' : '取消'}
      </button>
      <button class="primary-button" type="button" data-action="study-plan-save">
        ${onboarding ? '创建我的计划' : '保存计划'}
      </button>
    </div>`);
  if (onboarding) els.modal.classList.add('onboarding-modal');
  els.modal.scrollTop = 0;
  updateStudyPlanPreview();
}

function saveStudyPlanFromModal() {
  const draft = readStudyPlanDraft();
  if (draft.error) {
    toast(draft.error);
    return;
  }
  state.studyPlan = draft.plan;
  const now = Date.now();
  state.onboarding = normalizeOnboarding(
    {
      ...state.onboarding,
      status: 'completed',
      completedAt: state.onboarding.completedAt || now,
    },
    { existingUser: true },
  );
  if (state.studyPlan.coursePlanConfigured) {
    state.webCourses.courseSchedule = buildCoursePlanSchedule(
      state.studyPlan,
      true,
    );
  }
  scheduleSave();
  closeModal();
  render();
  toast('学习计划已保存，每日任务已重新计算');
}

function skipStudyPlanOnboarding() {
  const now = Date.now();
  state.onboarding = normalizeOnboarding(
    {
      ...state.onboarding,
      status: 'skipped',
      skippedAt: now,
      reminderDismissedAt: now,
    },
    { existingUser: true },
  );
  scheduleSave();
  closeModal();
  render();
  toast('已跳过计划设置，所有学习功能仍可正常使用');
}

function showStartupPlanGuide() {
  if (state.studyPlan.configured) return;
  openStudyPlanEditor('onboarding');
}

async function markStudyCourseDay() {
  const today = todayKey();
  const target = state.studyPlan.dailyCourseTarget || 0;
  if (!target) {
    toast('请先在计划中设置每天要上的网课数量');
    return;
  }
  const completed = courseSessionCountForDate(today);
  if (completed >= target) {
    toast('今天的网课目标已经完成');
    return;
  }
  let url = isAllowedBilibiliUrl(courseBrowserState.url)
    ? courseBrowserState.url
    : state.webCourses.lastUrl;
  let title =
    courseBrowserState.title ||
    state.webCourses.lastTitle ||
    '日语网课';
  let positionSeconds = 0;
  if (courseBrowserAttached && isCourseLearningUrl(url)) {
    try {
      const captured = await bridge.captureCoursePosition();
      if (captured?.ok) {
        positionSeconds = normalizeCoursePositionSeconds(
          captured.position?.seconds,
        );
        if (captured.title) title = captured.title;
        if (isAllowedBilibiliUrl(captured.url)) url = captured.url;
      }
    } catch {
      // Course completion can still be recorded when the player position is unavailable.
    }
  }
  state.webCourses.courseSessions.unshift({
    at: Date.now(),
    title: String(title).slice(0, 240),
    url: isAllowedBilibiliUrl(url) ? url : '',
    positionSeconds,
  });
  state.webCourses.courseSessions =
    state.webCourses.courseSessions.slice(0, 400);
  if (!state.studyPlan.courseDays.includes(today)) {
    state.studyPlan.courseDays = [...state.studyPlan.courseDays, today].slice(-60);
  }
  recordActivity('courses', `完成网课：${title}`);
  scheduleSave();
  render(true);
  toast(`已记录第 ${completed + 1}/${target} 节网课`);
}

function openPlanCourseSearch() {
  const query =
    state.studyPlan.currentLevel === 'zero' &&
    learnedKanaCount() < KANA_TOTAL
      ? '日语五十音 入门 网课'
      : `${state.studyPlan.targetLevel || 'N5'} 日语 网课`;
  const url = new URL('https://search.bilibili.com/all');
  url.searchParams.set('keyword', query);
  ui.courseQuery = query;
  state.webCourses.lastUrl = url.toString();
  state.webCourses.lastTitle = query;
  courseBrowserForceLoad = true;
  go('courses');
}

function renderData() {
  const percent = overallPercent();
  const summary = saveSummary(state);
  const savedText = lastSavedAt ? relativeTime(lastSavedAt) : '刚刚';
  const pathText = appInfo?.dataPath || '本机应用数据目录';

  return `
    <div class="page">
      <div class="panel data-hero">
        <div>
          <div class="hero-kicker">LOCAL DATA</div>
          <h2 class="section-title">学习记录都在本机</h2>
          <p class="section-subtitle">进度会自动保存在手机应用私有存储中。导出一份兼容备份，可通过文件管理器或分享工具另行保存。</p>
          <div class="data-hero-meta">
            <span>上次保存：${esc(savedText)}</span>
            <span>总体进度 ${percent}%</span>
            <span>连续学习 ${currentStudyStreak()} 天</span>
          </div>
        </div>
        <div class="data-progress">
          <div class="progress-label"><span>总体掌握</span><strong>${percent}%</strong></div>
          <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
          <p class="progress-hint">假名 ${summary.kana}/${KANA_TOTAL} · 词汇 ${summary.words}/${WORD_TOTAL} · 语法 ${summary.grammar}/${GRAMMAR_TOTAL}</p>
        </div>
      </div>

      <div class="data-grid">
        <section class="panel data-card">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">存档</h3>
              <p class="panel-note">通过 Android 系统保存或选择 Sakura 兼容 JSON 备份。</p>
            </div>
            <span class="data-badge">可迁移</span>
          </div>
          <div class="data-actions">
            <button class="primary-button data-action" type="button" data-action="export-save" data-backup-action>
              <span class="data-action-icon">↓</span>
              <span><strong>一键备份</strong><small>自动保存到应用专属 Sakura/Backups，文件名为日期时间</small></span>
            </button>
            <button class="secondary-button data-action" type="button" data-action="import-save" data-backup-action>
              <span class="data-action-icon">↑</span>
              <span><strong>恢复最近备份</strong><small>自动选择最近有效的本地备份，确认后恢复</small></span>
            </button>
          </div>
          <div class="data-actions">
            <button class="small-button" type="button" data-action="export-save-file" data-backup-action>
              保存备份副本到其他位置…
            </button>
            <button class="small-button" type="button" data-action="import-file" data-backup-action>
              从其他备份文件恢复…
            </button>
          </div>
          <div id="mobile-backup-info" class="data-status" aria-live="polite">
            <span></span>正在读取本地备份信息…
          </div>
          <p id="mobile-backup-path" class="panel-note">默认备份目录将在首次备份后显示。</p>
          <p class="panel-note">默认备份不会要求选择文件夹。恢复、另存或从其他文件导入前都会校验格式、版本和必要数据结构；覆盖前还会再次确认。</p>
        </section>

        <section class="panel data-card">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">数据位置</h3>
              <p class="panel-note">学习记录保存在 Android 应用私有存储，不会上传到服务器。</p>
            </div>
          </div>
          <div class="data-path">${esc(pathText)}</div>
          <div class="data-status"><span></span>自动保存已开启 · 上次保存 ${esc(savedText)}</div>
          <p class="panel-note">需要迁移时请使用上方“导出”按钮；系统文件选择器可直接保存到下载、云盘或手机存储。</p>
        </section>
      </div>

      <section class="panel data-card audio-settings-card">
        <div class="panel-head">
          <div>
            <h3 class="panel-title">声音设备</h3>
            <p class="panel-note">朗读和回放默认跟随 Android 系统输出设备；有线耳机与蓝牙设备通常由系统自动切换。</p>
          </div>
          <span class="data-badge">可切换</span>
        </div>
        <label class="shadow-device-label">
          播放设备
          <select id="audio-output-device" class="shadow-device" aria-label="选择播放设备">
            <option value="">系统默认播放设备</option>
          </select>
        </label>
        <p id="audio-output-note" class="panel-note">
          ${supportsAudioOutputSelection()
            ? '如果耳机已接入但系统默认设备没有切换，请在这里选择耳机。'
            : '当前 WebView 不支持应用内切换播放设备，请使用 Android 控制中心或系统设置调整媒体输出。'}
        </p>
        <div class="data-actions">
          <button class="small-button" type="button" data-action="test-audio-output">
            播放测试声音
          </button>
          <button class="small-button" type="button" data-action="open-sound-settings">
            查看系统声音提示
          </button>
        </div>
      </section>

      <section class="panel danger-panel">
        <div class="danger-copy">
          <h3 class="panel-title">重置学习进度</h3>
          <p class="panel-note">清空假名、词汇、语法、测验、学习计划和网课收藏记录，恢复到全新状态。内置课程内容不会受影响。</p>
        </div>
        <button class="danger-button" type="button" data-action="reset-progress">重置学习进度</button>
      </section>
    </div>`;
}

function compactCourseUrl(value) {
  if (!isAllowedBilibiliUrl(value)) return '尚未打开 B站页面';
  const url = new URL(value);
  const text = `${url.hostname}${url.pathname}${url.search}`;
  return text.length > 72 ? `${text.slice(0, 69)}…` : text;
}

function formatCoursePosition(secondsValue, durationValue = 0) {
  const seconds = normalizeCoursePositionSeconds(secondsValue);
  if (!seconds) return '';
  const format = (value) => {
    const total = Math.max(0, Math.round(Number(value) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    return hours
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
      : `${minutes}:${String(rest).padStart(2, '0')}`;
  };
  const duration = normalizeCoursePositionSeconds(durationValue);
  return duration ? `${format(seconds)} / ${format(duration)}` : format(seconds);
}

function courseResumeUrl(value, positionSeconds) {
  if (!isAllowedBilibiliUrl(value)) return '';
  const seconds = normalizeCoursePositionSeconds(positionSeconds);
  if (!seconds) return value;
  const url = new URL(value);
  if (!/\/video\/(?:BV|av)/i.test(url.pathname)) return value;
  url.searchParams.set('t', String(seconds));
  return url.toString();
}

function currentCourseUrl() {
  if (isAllowedBilibiliUrl(courseBrowserState.url)) {
    return courseBrowserState.url;
  }
  if (isAllowedBilibiliUrl(state.webCourses.lastUrl)) {
    return state.webCourses.lastUrl;
  }
  return COURSE_HOME_URL;
}

function courseStatusOptions(current) {
  return COURSE_STATUSES.map(
    (status) =>
      `<option value="${status}"${status === current ? ' selected' : ''}>${COURSE_STATUS_LABELS[status]}</option>`,
  ).join('');
}

function createCourseResourceId(prefix = 'course') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function moveOrderedItem(items, id, direction) {
  const index = items.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return false;
  [items[index], items[target]] = [items[target], items[index]];
  items.forEach((item, order) => {
    item.order = order + 1;
  });
  return true;
}

function orderedCourseLibrary() {
  return [...state.webCourses.favorites].sort(
    (left, right) =>
      Number(left.order || 0) - Number(right.order || 0) ||
      Number(left.addedAt || 0) - Number(right.addedAt || 0),
  );
}

function courseLessonEntries(course) {
  if (course?.chapters?.length) return course.chapters;
  if (!course) return [];
  if (course.kind === 'course' || (!course.url && !course.localPath)) return [];
  return [
    {
      id: '',
      title: course.title,
      resourceType: course.resourceType,
      url: course.url,
      localPath: course.localPath,
      durationMinutes: course.durationMinutes,
      status: course.status,
      progressSeconds: course.lastPositionSeconds,
      progressPercent: course.progressPercent,
      notes: course.notes,
      order: 0,
    },
  ];
}

function courseProgressSummary(course) {
  const lessons = courseLessonEntries(course);
  const completed = lessons.filter((item) => item.status === 'completed').length;
  const learning = lessons.filter((item) => item.status === 'learning').length;
  const totalMinutes = lessons.reduce(
    (total, item) => total + normalizeCourseDurationMinutes(item.durationMinutes),
    0,
  );
  const percent = lessons.length
    ? Math.round((completed / lessons.length) * 100)
    : course.progressPercent || 0;
  return {
    lessons,
    completed,
    learning,
    remaining: Math.max(0, lessons.length - completed),
    total: lessons.length,
    totalMinutes,
    percent,
  };
}

function courseResourceKindLabel(item) {
  if (item?.chapters?.length || (!item?.localPath && !item?.url)) return '课程组';
  if (item?.resourceType === 'local') return '本地';
  if (item?.resourceType === 'bilibili') return 'B站';
  return '未配置';
}

function findCourseLesson(course, chapterId = '') {
  if (!course) return null;
  if (!chapterId) return courseLessonEntries(course)[0] || null;
  return course.chapters.find((item) => item.id === chapterId) || null;
}

function recordLocalCourseVisit(course, lesson) {
  const now = Date.now();
  const title = String(lesson?.title || course?.title || '本地课程').slice(0, 240);
  const key = courseResourceKey(lesson || course);
  state.webCourses.recent = [
    {
      title,
      courseId: course.id,
      chapterId: lesson?.id || '',
      resourceType: 'local',
      localPath: lesson?.localPath || course.localPath || '',
      at: now,
    },
    ...(state.webCourses.recent || []).filter(
      (item) => courseResourceKey(item) !== key,
    ),
  ].slice(0, 12);
  course.lastVisitedAt = now;
  course.updatedAt = now;
  if (lesson && course.chapters.includes(lesson)) {
    lesson.progressPercent = Math.max(lesson.progressPercent || 0, 1);
  } else {
    course.progressPercent = Math.max(course.progressPercent || 0, 1);
  }
  scheduleSave();
}

function renderCourse() {
  const favorites = orderedCourseLibrary();
  const recent = state.webCourses.recent;
  const currentTitle =
    courseBrowserState.title ||
    state.webCourses.lastTitle ||
    '尚未打开课程';
  const currentUrl = currentCourseUrl();
  const canFavorite = isCourseLearningUrl(courseBrowserState.url);
  const currentFavorite = state.webCourses.favorites.find(
    (item) =>
      courseUrlKey(item.url) === courseUrlKey(courseBrowserState.url),
  );
  const dailyCourseTarget = state.studyPlan.dailyCourseTarget || 0;
  const todayCourseCount = courseSessionCountForDate(todayKey());
  const planConfigured = state.studyPlan.coursePlanConfigured === true;
  const planLessons = planConfigured
    ? coursePlanTargetLessons(state.studyPlan)
    : [];
  const planCompleted = planLessons.filter(
    ({ lesson }) => lesson.status === 'completed',
  ).length;
  const planPercent = planLessons.length
    ? Math.round((planCompleted / planLessons.length) * 100)
    : 0;
  const allScheduleEntries = planConfigured
    ? courseScheduleEntriesWithState()
    : [];
  const scheduleEntries = allScheduleEntries
    .filter((item) => !item.completed)
    .slice(0, 10);
  const scheduledToday = allScheduleEntries.filter(
    (item) => item.date === todayKey(),
  );
  const scheduledTodayCompleted = scheduledToday.filter(
    (item) => item.completed,
  ).length;
  const loadingLabel = courseBrowserState.loading
    ? '正在加载'
    : courseBrowserState.error
      ? '加载异常'
      : '已连接';
  const errorPanel = courseBrowserState.error
    ? `
      <div class="course-load-error">
        <div class="course-error-mark">!</div>
        <div>
          <strong>B站页面暂时无法正常加载</strong>
          <p>${esc(courseBrowserState.error)}</p>
          <p>可以重试，或使用系统默认浏览器打开当前 B站页面。应用不会绕过登录、版权或播放限制。</p>
          <div class="course-error-actions">
            <button class="primary-button" type="button" data-action="course-retry">重新加载</button>
            <button class="secondary-button" type="button" data-action="course-external">用系统浏览器打开</button>
          </div>
        </div>
      </div>`
    : `
      <div id="course-browser-host" class="course-browser-host">
        <div class="course-browser-placeholder">
          <span class="course-browser-placeholder-mark">講</span>
          <strong>正在准备 B站网课浏览器</strong>
          <p>登录 Cookie 会保存在独立会话中。视频播放、登录和版权限制均由 B站网页自身处理。</p>
        </div>
      </div>`;

  return `
    <div class="page course-page">
      <section class="course-search-panel">
        <div class="course-search-copy">
          <span class="course-kicker">BILIBILI COURSE</span>
          <strong>搜索日语网课</strong>
          <span>直接在软件内搜索、登录和观看，不下载视频。</span>
        </div>
        <div class="course-search-controls">
          <input class="search-input" id="course-search" type="search" autocomplete="off"
            placeholder="例如：N4 日语语法、大家的日语" value="${esc(ui.courseQuery)}"
            aria-label="搜索B站日语网课" />
          <button class="primary-button" type="button" data-action="course-search">搜索</button>
        </div>
        <div class="course-search-suggestions">
          ${[
            '日语入门',
            'N5 日语 网课',
            'N4 日语 语法',
            'JLPT 日语听力',
          ]
            .map(
              (query) =>
                `<button type="button" data-action="course-suggest" data-query="${esc(query)}">${esc(query)}</button>`,
            )
            .join('')}
        </div>
      </section>

      <div class="course-layout">
        <section class="course-browser-panel">
          <div class="course-browser-toolbar">
            <div class="course-browser-nav">
              <button id="course-back" class="course-nav-button" type="button"
                data-action="course-back" aria-label="返回上一页"
                ${courseBrowserState.canGoBack ? '' : 'disabled'}>←</button>
              <button id="course-forward" class="course-nav-button" type="button"
                data-action="course-forward" aria-label="前进"
                ${courseBrowserState.canGoForward ? '' : 'disabled'}>→</button>
              <button id="course-reload" class="course-nav-button" type="button"
                data-action="course-reload" aria-label="刷新">↻</button>
              <button class="course-nav-button" type="button"
                data-action="course-home" aria-label="返回B站首页">⌂</button>
            </div>
            <div class="course-browser-address">
              <span id="course-browser-title" class="course-browser-title">${esc(currentTitle)}</span>
              <span id="course-browser-url" class="course-browser-url">${esc(compactCourseUrl(currentUrl))}</span>
            </div>
            <span id="course-browser-indicator" class="course-browser-indicator${courseBrowserState.loading ? ' loading' : ''}">
              ${esc(loadingLabel)}
            </span>
            <button class="small-button course-external-button" type="button" data-action="course-external">
              系统浏览器
            </button>
          </div>
          <p class="course-playback-note">
            登录与播放由 B站网页处理；若播放器提示版权、解码或登录兼容问题，请使用右上角的“系统浏览器”备用。
          </p>
          ${errorPanel}
        </section>

        <aside class="course-side-panel">
          <section class="course-side-section course-save-section">
            <div class="course-side-heading">
              <h3>收藏当前课程</h3>
              <span>${canFavorite ? '可收藏' : '请先打开视频页'}</span>
            </div>
            <strong class="course-current-title">${esc(currentTitle)}</strong>
            <p>${esc(compactCourseUrl(currentUrl))}</p>
            <div class="course-save-row">
              <label class="compact-filter">JLPT 等级
                <select id="course-save-level">
                  ${COURSE_LEVELS.map(
                    (level) =>
                      `<option value="${level}"${level === ui.courseSaveLevel ? ' selected' : ''}>${level}</option>`,
                  ).join('')}
                </select>
              </label>
              <button class="primary-button" type="button" data-action="course-favorite"
                ${canFavorite ? '' : 'disabled'}>收藏课程</button>
            </div>
            <div class="course-position-row">
              <button class="small-button" type="button" data-action="course-capture-position"
                ${currentFavorite && canFavorite ? '' : 'disabled'}>
                记录播放位置
              </button>
              <span>${currentFavorite?.lastPositionSeconds ? `上次 ${esc(formatCoursePosition(currentFavorite.lastPositionSeconds, currentFavorite.lastPositionDuration))}` : '收藏后可记录'}</span>
            </div>
            <p class="course-cookie-note">B站登录与 Cookie 保存在独立网页会话中，不进入学习存档。</p>
          </section>

          <section class="course-side-section course-daily-section">
            <div class="course-side-heading">
              <h3>今日网课计划</h3>
              <span>${planConfigured ? scheduledTodayCompleted : todayCourseCount}/${planConfigured ? scheduledToday.length : dailyCourseTarget || 0} 节</span>
            </div>
            ${
              planConfigured
                ? `<p class="course-plan-empty">今天的课程由学习计划安排。请在上方课程任务中打开或标记完成，打开课程不会被自动算作完成。</p>`
                : `<label class="compact-filter">每天计划
                    <select id="course-daily-target">
                      ${COURSE_DAILY_TARGETS.map(
                        (count) =>
                          `<option value="${count}"${count === dailyCourseTarget ? ' selected' : ''}>${count ? `${count} 节` : '不设任务'}</option>`,
                      ).join('')}
                    </select>
                  </label>
                  <button class="primary-button course-session-button" type="button"
                    data-action="study-plan-course-done"
                    ${!dailyCourseTarget || todayCourseCount >= dailyCourseTarget ? 'disabled' : ''}>
                    ${dailyCourseTarget
                      ? todayCourseCount >= dailyCourseTarget
                        ? '今日目标已完成'
                        : `记录完成第 ${todayCourseCount + 1} 节`
                      : '先设置每日节数'}
                  </button>`
            }
          </section>

          <section class="course-side-section course-plan-section">
            <div class="course-side-heading">
              <h3>课程学习计划</h3>
              <span>${planConfigured ? `${planPercent}%` : '未设置'}</span>
            </div>
            ${
              planConfigured
                ? `<div class="course-plan-summary">
                    <strong>${planCompleted}/${planLessons.length} 节完成</strong>
                    <span>${esc(state.studyPlan.courseStartDate)} → ${esc(state.studyPlan.courseTargetDate)}</span>
                    <span>每周 ${state.studyPlan.weeklyStudyDays} 天 · 每天 ${state.studyPlan.dailyCourseTarget} 节 · 约 ${state.studyPlan.courseDailyMinutes} 分钟</span>
                    <div class="course-resource-progress"><i style="width:${planPercent}%"></i></div>
                  </div>
                  <div class="course-plan-task-list">
                    ${
                      scheduleEntries.length
                        ? scheduleEntries
                            .map(
                              (item) => `
                          <div class="course-plan-task${item.overdue ? ' overdue' : ''}">
                            <button type="button" data-action="course-resource-open"
                              data-course-id="${esc(item.courseId)}"
                              data-chapter-id="${esc(item.chapterId)}">
                              <span>${esc(item.date)}${item.overdue ? ' · 待补' : ''}</span>
                              <strong>${esc(item.title)}</strong>
                              <small>${item.plannedMinutes ? `${item.plannedMinutes} 分钟` : '时长待补充'}</small>
                            </button>
                            <button class="small-button" type="button"
                              data-action="course-schedule-complete"
                              data-course-id="${esc(item.courseId)}"
                              data-chapter-id="${esc(item.chapterId)}">完成</button>
                          </div>`,
                            )
                            .join('')
                        : '<div class="course-list-empty">当前没有待安排的课程。</div>'
                    }
                  </div>
                  <div class="course-plan-actions">
                    <button class="small-button" type="button" data-action="course-plan-dashboard">查看计划日历</button>
                    <button class="small-button" type="button" data-action="course-plan-edit">修改计划</button>
                    <button class="small-button" type="button" data-action="course-plan-replan">重新安排剩余课程</button>
                  </div>`
                : `<p class="course-plan-empty">设置目标日期、每日节数和可用时间后，系统会按真实课程时长给出建议，并把课程分配到学习日。</p>
                   <button class="primary-button" type="button" data-action="course-plan-edit">设置课程计划</button>`
            }
          </section>

          <section class="course-side-section course-library-section">
            <div class="course-side-heading">
              <h3>我的课程</h3>
              <span>${favorites.length} 门课程</span>
            </div>
            <div class="course-library-actions">
              <button class="primary-button" type="button" data-action="course-local-import">
                导入本地课程
              </button>
              <button class="small-button" type="button" data-action="course-create">
                新建课程组
              </button>
            </div>
            <p class="course-library-note">新增课程使用本地文件，通过系统默认播放器打开；B站收藏继续使用当前内置浏览器。</p>
            <div class="course-favorite-list">
              ${
                favorites.length
                  ? favorites
                      .map((item, index) => {
                        const progress = courseProgressSummary(item);
                        const lessonHint = item.chapters.length
                          ? `${progress.completed}/${progress.total} 节完成`
                          : item.localPath
                            ? item.localPath
                            : item.lastVisitedAt
                              ? `最近访问 ${relativeTime(item.lastVisitedAt)}`
                              : '尚未开始';
                        return `
                <article class="course-favorite-card course-resource-card">
                  <button class="course-favorite-open" type="button"
                    data-action="course-resource-open" data-course-id="${esc(item.id)}"
                    ${!item.chapters.length && !item.localPath && !item.url ? 'disabled' : ''}>
                    <span class="course-level-badge">${esc(courseResourceKindLabel(item))}</span>
                    <strong>${esc(item.title)}</strong>
                    <small>${esc(item.category)} · ${esc(lessonHint)}</small>
                    <span class="course-resource-progress">
                      <i style="width:${progress.percent}%"></i>
                    </span>
                  </button>
                  <div class="course-favorite-actions course-resource-actions">
                    ${
                      item.chapters.length
                        ? `<span class="course-derived-status">${progress.completed === progress.total ? '已完成' : progress.completed || progress.learning ? '学习中' : '未开始'}</span>`
                        : `<select data-course-status-id="${esc(item.id)}" aria-label="更新课程学习状态">
                            ${courseStatusOptions(item.status)}
                          </select>`
                    }
                    <button type="button" data-action="course-edit" data-course-id="${esc(item.id)}">编辑</button>
                    ${
                      item.resourceType === 'local'
                        ? `<button type="button" data-action="course-chapters" data-course-id="${esc(item.id)}">章节</button>`
                        : ''
                    }
                    <button type="button" data-action="course-order" data-course-id="${esc(item.id)}"
                      data-direction="-1" ${index === 0 ? 'disabled' : ''} aria-label="上移课程">↑</button>
                    <button type="button" data-action="course-order" data-course-id="${esc(item.id)}"
                      data-direction="1" ${index === favorites.length - 1 ? 'disabled' : ''} aria-label="下移课程">↓</button>
                    <button type="button" data-action="course-delete" data-course-id="${esc(item.id)}">删除</button>
                  </div>
                </article>`;
                      })
                      .join('')
                  : '<div class="course-list-empty">课程库还是空的。可以导入本地视频、音频或 PDF，也可以继续收藏 B站课程。</div>'
              }
            </div>
          </section>

          <section class="course-side-section course-recent-section">
            <div class="course-side-heading">
              <h3>最近学习</h3>
              <span>自动记录视频页</span>
            </div>
            <div class="course-recent-list">
              ${
                recent.length
                  ? recent
                      .map(
                        (item) => `
                <button type="button" data-action="course-recent-open"
                  data-course-id="${esc(item.courseId || '')}"
                  data-chapter-id="${esc(item.chapterId || '')}"
                  data-url="${esc(courseResumeUrl(item.url, item.lastPositionSeconds))}"
                  data-local-path="${esc(item.localPath || '')}">
                  <strong>${esc(item.title)}</strong>
                  <span>${courseResourceKindLabel(item)} · ${item.lastPositionSeconds ? `位置 ${esc(formatCoursePosition(item.lastPositionSeconds, item.lastPositionDuration))}` : esc(relativeTime(item.at))}</span>
                </button>`,
                      )
                      .join('')
                  : '<div class="course-list-empty">打开过的 B站视频会显示在这里，并在重启后恢复。</div>'
              }
            </div>
          </section>
        </aside>
      </div>
    </div>`;
}

function readCoursePlanDraft() {
  const startDate =
    normalizeCoursePlanDate(
      document.getElementById('course-plan-start')?.value,
    ) || '';
  const targetDate =
    normalizeCoursePlanDate(
      document.getElementById('course-plan-target')?.value,
    ) || '';
  const availableLessons = coursePlanLibraryLessons().length;
  const requestedTargetCount = Math.max(
    0,
    Math.round(
      Number(document.getElementById('course-plan-count')?.value) || 0,
    ),
  );
  const targetCount = Math.min(availableLessons, requestedTargetCount);
  const dailyCourseTarget = Number(
    document.getElementById('course-plan-daily-count')?.value,
  );
  const weeklyStudyDays = Number(
    document.getElementById('course-plan-weekly-days')?.value,
  );
  const courseDailyMinutes = Number(
    document.getElementById('course-plan-minutes')?.value,
  );
  const courseIntensity = normalizeCourseIntensity(
    document.getElementById('course-plan-intensity')?.value,
  );
  if (!availableLessons) {
    return { error: '课程库还没有可安排的学习资源，请先导入本地课程。' };
  }
  if (!targetCount) {
    return { error: '目标课程数量至少需要 1 节。' };
  }
  if (requestedTargetCount > availableLessons) {
    return {
      error: `当前只有 ${availableLessons} 节可规划课程，请把目标数量调整到 ${availableLessons} 或更少。`,
    };
  }
  if (!startDate) return { error: '请选择有效的计划开始日期。' };
  if (!targetDate) return { error: '请选择有效的目标完成日期。' };
  if (targetDate < startDate) {
    return { error: '目标完成日期不能早于计划开始日期。' };
  }
  if (targetDate < todayKey()) {
    return { error: '目标完成日期已经过去，请选择今天或之后的日期。' };
  }
  if (!COURSE_DAILY_TARGETS.includes(dailyCourseTarget) || dailyCourseTarget < 1) {
    return { error: '每天至少安排 1 节课程。' };
  }
  if (!STUDY_WEEKLY_DAYS.includes(weeklyStudyDays)) {
    return { error: '每周学习天数无效。' };
  }
  if (!COURSE_PLAN_MINUTES.includes(courseDailyMinutes)) {
    return { error: '每天课程学习时间无效。' };
  }
  return {
    error: '',
    plan: normalizeStudyPlan({
      ...state.studyPlan,
      coursePlanConfigured: true,
      courseStartDate: startDate,
      courseTargetDate: targetDate,
      courseTargetCount: targetCount,
      dailyCourseTarget,
      weeklyStudyDays,
      courseDailyMinutes,
      courseIntensity,
      coursePlanUpdatedAt: Date.now(),
    }),
    availableLessons,
  };
}

function coursePlanSuggestionMarkup(suggestion) {
  if (!suggestion) {
    return `<strong>等待生成建议</strong><p>填写日期和可用时间后点击“生成建议”，不会自动修改你的计划。</p>`;
  }
  if (!suggestion.ok) {
    return `<strong>暂时无法建议</strong><p>${esc(suggestion.error)}</p>`;
  }
  if (suggestion.complete) {
    return `<strong>目标课程已完成</strong><p>${esc(suggestion.message)}</p>`;
  }
  return `
    <strong>${suggestion.targetFeasible ? '建议方案可行' : '当前目标偏紧'}</strong>
    <p>剩余 ${suggestion.remainingLessons}/${suggestion.totalLessons} 节，平均每节约 ${suggestion.averageLessonMinutes} 分钟${suggestion.durationEstimated ? '（部分时长未填写，按平均值估算）' : ''}。</p>
    <p>${esc(suggestion.message)}</p>
    <p>可用学习日 ${suggestion.availableDays} 天，预计完成日期 ${esc(suggestion.projectedEnd)}。</p>
    <div class="course-plan-suggestion-actions">
      <button class="primary-button" type="button" data-action="course-plan-accept">采用建议</button>
      <button class="small-button" type="button" data-action="course-plan-ignore">忽略</button>
    </div>`;
}

function updateCoursePlanSuggestion(suggestion = null) {
  ui.coursePlanSuggestion = suggestion;
  const box = document.getElementById('course-plan-suggestion');
  if (!box) return;
  box.className = `course-plan-suggestion${suggestion && !suggestion.ok ? ' warning' : ''}`;
  box.innerHTML = coursePlanSuggestionMarkup(suggestion);
}

function openCoursePlanEditor() {
  const plan = state.studyPlan;
  const today = todayKey();
  const availableLessons = coursePlanLibraryLessons().length;
  const targetCount = Math.min(
    availableLessons,
    Number(plan.courseTargetCount) || availableLessons,
  );
  const startDate =
    normalizeCoursePlanDate(plan.courseStartDate) || today;
  const targetDate =
    normalizeCoursePlanDate(plan.courseTargetDate) ||
    coursePlanAddDays(startDate, 56);
  ui.coursePlanSuggestion = null;
  openModal(`
    <h3>课程学习计划</h3>
    <p class="panel-note">计划根据真实课程状态和预计时长计算。打开课程不会自动完成，只有标记完成或记录完成会话才计入进度。</p>
    <div class="course-plan-form">
      <label>计划开始日期
        <input id="course-plan-start" type="date" value="${esc(startDate)}" />
      </label>
      <label>目标完成日期
        <input id="course-plan-target" type="date" value="${esc(targetDate)}" />
      </label>
      <label>计划完成课程总数
        <input id="course-plan-count" type="number" min="1" max="${availableLessons}"
          value="${targetCount || 1}" />
      </label>
      <label>每天学习节数
        <select id="course-plan-daily-count">
          ${COURSE_DAILY_TARGETS.filter((count) => count > 0)
            .map(
              (count) =>
                `<option value="${count}"${count === (plan.dailyCourseTarget || 1) ? ' selected' : ''}>${count} 节</option>`,
            )
            .join('')}
        </select>
      </label>
      <label>每天课程可用时间
        <select id="course-plan-minutes">
          ${COURSE_PLAN_MINUTES.map(
            (minutes) =>
              `<option value="${minutes}"${minutes === (plan.courseDailyMinutes || 30) ? ' selected' : ''}>${minutes} 分钟</option>`,
          ).join('')}
        </select>
      </label>
      <label>每周学习天数
        <select id="course-plan-weekly-days">
          ${STUDY_WEEKLY_DAYS.map(
            (days) =>
              `<option value="${days}"${days === (plan.weeklyStudyDays || 7) ? ' selected' : ''}>${days} 天</option>`,
          ).join('')}
        </select>
      </label>
      <label>学习强度
        <select id="course-plan-intensity">
          ${COURSE_PLAN_INTENSITIES.map(
            ([id, label]) =>
              `<option value="${id}"${id === normalizeCourseIntensity(plan.courseIntensity) ? ' selected' : ''}>${label}</option>`,
          ).join('')}
        </select>
      </label>
    </div>
    <p class="panel-note course-plan-weekday-note">当前按“每周学习天数”在周一至周日之间均匀安排学习日；保存后仍可重新安排剩余课程。</p>
    <div id="course-plan-suggestion" class="course-plan-suggestion">
      ${coursePlanSuggestionMarkup(null)}
    </div>
    <div class="modal-actions">
      <button class="secondary-button" type="button" data-action="course-plan-suggest">生成建议</button>
      <button class="secondary-button" type="button" data-action="modal-cancel">取消</button>
      <button class="primary-button" type="button" data-action="course-plan-save">保存并安排课程</button>
    </div>`);
}

function suggestCoursePlan() {
  const draft = readCoursePlanDraft();
  if (draft.error) {
    updateCoursePlanSuggestion({ ok: false, error: draft.error });
    return;
  }
  const suggestion = calculateCoursePlanSuggestion(draft.plan);
  updateCoursePlanSuggestion(suggestion);
}

function acceptCoursePlanSuggestion() {
  const suggestion = ui.coursePlanSuggestion;
  if (!suggestion?.ok || suggestion.complete) return;
  const dailyCount = document.getElementById('course-plan-daily-count');
  const dailyMinutes = document.getElementById('course-plan-minutes');
  const targetDate = document.getElementById('course-plan-target');
  if (dailyCount) {
    const value = Math.min(
      10,
      Math.max(1, suggestion.suggestedDailyCount),
    );
    const option = [...dailyCount.options].find(
      (item) => Number(item.value) === value,
    );
    if (option) dailyCount.value = option.value;
  }
  if (dailyMinutes) {
    const values = [...dailyMinutes.options].map((item) =>
      Number(item.value),
    );
    const value =
      values.find((item) => item >= suggestion.suggestedDailyMinutes) ||
      values[values.length - 1];
    if (value) dailyMinutes.value = String(value);
  }
  if (targetDate && !suggestion.targetFeasible) {
    targetDate.value = suggestion.projectedEnd;
  }
  updateCoursePlanSuggestion({
    ...suggestion,
    message: `${suggestion.message} 建议已填入，你仍可继续修改。`,
  });
  toast('建议已填入计划，保存后生效');
}

function saveCoursePlanFromModal() {
  const draft = readCoursePlanDraft();
  if (draft.error) {
    updateCoursePlanSuggestion({ ok: false, error: draft.error });
    return;
  }
  state.studyPlan = {
    ...draft.plan,
    coursePlanConfigured: true,
    coursePlanUpdatedAt: Date.now(),
  };
  state.webCourses.courseSchedule = buildCoursePlanSchedule(
    state.studyPlan,
    true,
  );
  ui.courseCalendarMonth = state.studyPlan.courseStartDate.slice(0, 7);
  ui.courseCalendarSelectedDate =
    state.studyPlan.courseStartDate >= todayKey()
      ? state.studyPlan.courseStartDate
      : todayKey();
  const suggestion = calculateCoursePlanSuggestion(state.studyPlan);
  scheduleSave();
  closeModal();
  render();
  toast(
    suggestion.ok && !suggestion.complete && !suggestion.targetFeasible
      ? `计划已保存，但按当前安排可能延迟到 ${suggestion.projectedEnd} 完成`
      : '课程学习计划已保存，剩余课程已按学习日分配',
  );
}

function rescheduleRemainingCourses() {
  if (!state.studyPlan.coursePlanConfigured) {
    toast('请先设置课程学习计划');
    return;
  }
  state.webCourses.courseSchedule = buildCoursePlanSchedule(
    state.studyPlan,
    false,
  );
  state.studyPlan.coursePlanUpdatedAt = Date.now();
  scheduleSave();
  render(true);
  if (els.backdrop && !els.backdrop.hidden) openCoursePlanDashboard();
  toast('已重新安排剩余课程，已完成记录保持不变');
}

function shiftCoursePlanCalendar(offset) {
  const [year, month] = ui.courseCalendarMonth
    .split('-')
    .map((value) => Number(value));
  const date = new Date(year, month - 1 + offset, 1, 12);
  ui.courseCalendarMonth = `${date.getFullYear()}-${String(
    date.getMonth() + 1,
  ).padStart(2, '0')}`;
  ui.courseCalendarSelectedDate = ui.courseCalendarMonth === todayKey().slice(0, 7)
    ? todayKey()
    : `${ui.courseCalendarMonth}-01`;
  openCoursePlanDashboard();
}

function openCoursePlanDashboard() {
  if (!state.studyPlan.coursePlanConfigured) {
    openCoursePlanEditor();
    return;
  }
  const [year, month] = ui.courseCalendarMonth
    .split('-')
    .map((value) => Number(value));
  const firstDay = new Date(year, month - 1, 1, 12);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leading = firstDay.getDay();
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const entries = courseScheduleEntriesWithState();
  const targetLessons = coursePlanTargetLessons(state.studyPlan);
  const completedLessons = targetLessons.filter(
    ({ lesson }) => lesson.status === 'completed',
  ).length;
  const percent = targetLessons.length
    ? Math.round((completedLessons / targetLessons.length) * 100)
    : 0;
  const overdue = entries.filter((item) => item.overdue).length;
  const selectedDate = ui.courseCalendarSelectedDate?.startsWith(monthKey)
    ? ui.courseCalendarSelectedDate
    : todayKey().startsWith(monthKey)
      ? todayKey()
      : `${monthKey}-01`;
  ui.courseCalendarSelectedDate = selectedDate;
  const selectedEntries = entries.filter((item) => item.date === selectedDate);
  const today = todayKey();
  const cells = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  openModal(`
    <div class="course-calendar-heading">
      <div>
        <span class="course-calendar-kicker">COURSE ROADMAP</span>
        <h3>课程计划日历</h3>
        <p>${esc(state.studyPlan.courseStartDate)} → ${esc(state.studyPlan.courseTargetDate)}</p>
      </div>
      <div class="calendar-month-nav">
        <button type="button" data-action="course-plan-calendar-prev" aria-label="上个月">‹</button>
        <strong>${year} 年 ${month} 月</strong>
        <button type="button" data-action="course-plan-calendar-next" aria-label="下个月">›</button>
        <button class="calendar-today-button" type="button" data-action="course-plan-calendar-today">今天</button>
      </div>
    </div>
    <div class="course-plan-dashboard-stats">
      <span><strong>${completedLessons}/${targetLessons.length}</strong>已完成课程</span>
      <span><strong>${percent}%</strong>总体进度</span>
      <span class="${overdue ? 'warning' : ''}"><strong>${overdue}</strong>逾期待补</span>
      <span><strong>${state.studyPlan.weeklyStudyDays}</strong>天/周</span>
    </div>
    <div class="course-plan-overall-progress"><i style="width:${percent}%"></i></div>
    <div class="course-calendar-weekdays" aria-hidden="true">
      ${['日', '一', '二', '三', '四', '五', '六'].map((day) => `<span>${day}</span>`).join('')}
    </div>
    <div class="course-calendar-grid" role="grid" aria-label="${year}年${month}月课程计划">
      ${cells
        .map((day) => {
          if (!day) return '<span class="course-calendar-blank"></span>';
          const dateKey = `${monthKey}-${String(day).padStart(2, '0')}`;
          const dayEntries = entries.filter((item) => item.date === dateKey);
          const completed = dayEntries.filter((item) => item.completed).length;
          const overdueDay = dayEntries.some((item) => item.overdue);
          return `<button type="button"
            class="course-calendar-day${dateKey === today ? ' today' : ''}${dateKey === selectedDate ? ' selected' : ''}${dayEntries.length ? ' scheduled' : ''}${overdueDay ? ' overdue' : ''}${dayEntries.length && completed === dayEntries.length ? ' completed' : ''}"
            data-action="course-plan-calendar-select" data-date="${dateKey}">
            <span>${day}</span>
            ${dayEntries.length ? `<small>${completed}/${dayEntries.length}</small>` : ''}
          </button>`;
        })
        .join('')}
    </div>
    <section class="course-calendar-day-detail">
      <div class="panel-head">
        <div>
          <h3 class="panel-title">${esc(selectedDate)}</h3>
          <p class="panel-note">${selectedEntries.length ? `共 ${selectedEntries.length} 节课程` : '当天没有课程安排'}</p>
        </div>
      </div>
      ${
        selectedEntries.length
          ? `<div class="course-calendar-task-list">
              ${selectedEntries
                .map(
                  (item) => `
                  <div class="course-calendar-task${item.completed ? ' completed' : ''}${item.overdue ? ' overdue' : ''}">
                    <button type="button" data-action="course-resource-open"
                      data-course-id="${esc(item.courseId)}"
                      data-chapter-id="${esc(item.chapterId)}">
                      <strong>${esc(item.title)}</strong>
                      <span>${esc(item.course.title)} · ${item.plannedMinutes ? `${item.plannedMinutes} 分钟` : '时长待补充'}</span>
                    </button>
                    <span>${item.completed ? '已完成' : item.overdue ? '待补' : '待学习'}</span>
                    ${
                      item.completed
                        ? ''
                        : `<button class="small-button" type="button"
                            data-action="course-plan-task-complete"
                            data-course-id="${esc(item.courseId)}"
                            data-chapter-id="${esc(item.chapterId)}">完成</button>`
                    }
                  </div>`,
                )
                .join('')}
            </div>`
          : '<div class="course-list-empty">这一天没有安排课程。</div>'
      }
    </section>
    <div class="modal-actions course-plan-dashboard-actions">
      <button class="secondary-button" type="button" data-action="course-plan-edit">修改计划</button>
      <button class="secondary-button" type="button" data-action="course-plan-replan">重新安排剩余课程</button>
      <button class="primary-button" type="button" data-action="modal-cancel">关闭</button>
    </div>`);
  els.modal.classList.add('course-plan-modal');
}

function courseById(courseId) {
  return state.webCourses.favorites.find((item) => item.id === courseId) || null;
}

function courseChapterById(course, chapterId) {
  return course?.chapters.find((item) => item.id === chapterId) || null;
}

function courseStatusLabel(status) {
  return COURSE_STATUS_LABELS[normalizeCourseStatus(status)];
}

function courseCategoryOptions(current) {
  return COURSE_CATEGORIES.map(
    (category) =>
      `<option value="${esc(category)}"${category === current ? ' selected' : ''}>${esc(category)}</option>`,
  ).join('');
}

function courseResourceDescription(course) {
  if (course?.localPath) return course.localPath;
  if (course?.url) return course.url;
  if (course?.chapters?.length) return `课程组 · ${course.chapters.length} 节`;
  return '尚未绑定资源';
}

function recordCourseCompletion(course, lesson = null) {
  const completedLesson = lesson || courseLessonEntries(course)[0];
  if (!completedLesson) return false;
  if (!courseResourceKey(completedLesson)) return false;
  const courseKey = [
    course.id,
    completedLesson.id || '',
  ].join(':');
  if (
    state.webCourses.courseSessions.some(
      (item) =>
        item.completed === true &&
        String(item.courseId || '') === course.id &&
        String(item.chapterId || '') === String(completedLesson.id || ''),
    )
  ) {
    return false;
  }
  state.webCourses.courseSessions.unshift({
    at: Date.now(),
    courseId: course.id,
    chapterId: completedLesson.id || '',
    title: completedLesson.title || course.title,
    resourceType: completedLesson.resourceType,
    url: completedLesson.url || '',
    localPath: completedLesson.localPath || '',
    durationMinutes: completedLesson.durationMinutes || 0,
    completed: true,
    sessionKey: courseKey,
  });
  state.webCourses.courseSessions =
    state.webCourses.courseSessions.slice(0, 2000);
  return true;
}

function syncCourseGroupStatus(course) {
  if (!course?.chapters?.length) return;
  const progress = courseProgressSummary(course);
  course.status =
    progress.completed === progress.total
      ? 'completed'
      : progress.completed || progress.learning
        ? 'learning'
        : 'unstarted';
  course.progressPercent = progress.percent;
  course.updatedAt = Date.now();
}

const COURSE_WEEKDAY_PATTERNS = {
  3: [0, 2, 4],
  4: [0, 1, 3, 5],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};

function coursePlanDate(dateKey) {
  return new Date(`${dateKey}T12:00:00`);
}

function coursePlanAddDays(dateKey, amount) {
  const date = coursePlanDate(dateKey);
  date.setDate(date.getDate() + amount);
  return localDateKey(date.getTime());
}

function coursePlanStudyDates(startDate, endDate, weeklyDays, maxDays = 730) {
  const dates = [];
  const normalizedWeeklyDays = STUDY_WEEKLY_DAYS.includes(Number(weeklyDays))
    ? Number(weeklyDays)
    : 7;
  const weekdays = new Set(COURSE_WEEKDAY_PATTERNS[normalizedWeeklyDays]);
  let cursor = normalizeCoursePlanDate(startDate) || todayKey();
  const end = normalizeCoursePlanDate(endDate);
  let count = 0;
  while ((!end || cursor <= end) && count < maxDays) {
    const date = coursePlanDate(cursor);
    const weekday = (date.getDay() + 6) % 7;
    if (weekdays.has(weekday)) dates.push(cursor);
    cursor = coursePlanAddDays(cursor, 1);
    count += 1;
  }
  return dates;
}

function coursePlanLibraryLessons() {
  return orderedCourseLibrary().flatMap((course) =>
    courseLessonEntries(course)
      .filter((lesson) => courseResourceKey(lesson))
      .map((lesson) => ({ course, lesson })),
  );
}

function coursePlanTargetLessons(plan) {
  const lessons = coursePlanLibraryLessons();
  const target = Math.max(
    0,
    Math.round(Number(plan?.courseTargetCount) || lessons.length),
  );
  return lessons.slice(0, target || lessons.length);
}

function calculateCoursePlanSuggestion(planValue) {
  const plan = normalizeStudyPlan({
    ...planValue,
    coursePlanConfigured: true,
  });
  const entries = coursePlanTargetLessons(plan);
  if (!entries.length) {
    return {
      ok: false,
      error: '课程库还没有可安排的学习资源。请先导入本地课程。',
    };
  }
  const remaining = entries.filter(
    ({ lesson }) => lesson.status !== 'completed',
  );
  if (!remaining.length) {
    return {
      ok: true,
      complete: true,
      remainingLessons: 0,
      totalLessons: entries.length,
      message: '目标范围内的课程已经全部完成。',
    };
  }
  const startDate =
    plan.courseStartDate && plan.courseStartDate >= todayKey()
      ? plan.courseStartDate
      : todayKey();
  const targetDate =
    plan.courseTargetDate && plan.courseTargetDate >= startDate
      ? plan.courseTargetDate
      : coursePlanAddDays(startDate, 56);
  const availableDates = coursePlanStudyDates(
    startDate,
    targetDate,
    plan.weeklyStudyDays,
  );
  const availableDays = Math.max(1, availableDates.length);
  const knownDurations = remaining.filter(
    ({ lesson }) => Number(lesson.durationMinutes) > 0,
  );
  const totalKnownMinutes = knownDurations.reduce(
    (total, { lesson }) => total + Number(lesson.durationMinutes || 0),
    0,
  );
  const averageLessonMinutes = knownDurations.length
    ? Math.max(1, Math.round(totalKnownMinutes / knownDurations.length))
    : 25;
  const intensity =
    COURSE_PLAN_INTENSITIES.find(
      ([id]) => id === normalizeCourseIntensity(plan.courseIntensity),
    ) || COURSE_PLAN_INTENSITIES[1];
  const intensityFactor = intensity[2];
  const availableMinutes = Math.max(
    10,
    Math.round(plan.courseDailyMinutes * intensityFactor),
  );
  const requiredByDeadline = Math.ceil(remaining.length / availableDays);
  const capacityByMinutes = Math.max(
    1,
    Math.floor(availableMinutes / averageLessonMinutes),
  );
  const suggestedDailyCount = Math.max(
    1,
    Math.min(10, requiredByDeadline, capacityByMinutes),
  );
  const daysNeeded = Math.max(
    1,
    Math.ceil(remaining.length / suggestedDailyCount),
  );
  const projectedDates = coursePlanStudyDates(
    startDate,
    '',
    plan.weeklyStudyDays,
    Math.max(daysNeeded + 14, 120),
  );
  const projectedEnd =
    projectedDates[Math.min(daysNeeded - 1, projectedDates.length - 1)] ||
    targetDate;
  const suggestedDailyMinutes = Math.min(
    180,
    Math.max(
      10,
      Math.ceil((suggestedDailyCount * averageLessonMinutes * 1.15) / 5) * 5,
    ),
  );
  const targetFeasible =
    projectedEnd <= targetDate && suggestedDailyMinutes <= availableMinutes;
  return {
    ok: true,
    complete: false,
    totalLessons: entries.length,
    remainingLessons: remaining.length,
    availableDays,
    averageLessonMinutes,
    durationEstimated: knownDurations.length < remaining.length,
    intensity: intensity[0],
    intensityLabel: intensity[1],
    suggestedDailyCount,
    suggestedDailyMinutes,
    requiredByDeadline,
    capacityByMinutes,
    projectedEnd,
    targetFeasible,
    message: targetFeasible
      ? `按目标日期安排，建议每天 ${suggestedDailyCount} 节，约 ${suggestedDailyMinutes} 分钟。`
      : `按当前日期和目标，建议每天 ${suggestedDailyCount} 节，预计 ${projectedEnd} 完成；建议将目标日期调整到该日期以后，或提高每日可用时间。`,
  };
}

function buildCoursePlanSchedule(planValue, preservePast = true) {
  const plan = normalizeStudyPlan({
    ...planValue,
    coursePlanConfigured: true,
  });
  const entries = coursePlanTargetLessons(plan);
  const today = todayKey();
  const existing = normalizeCourseSchedule(
    state.webCourses.courseSchedule,
  ).filter((item) => {
    const course = courseById(item.courseId);
    const lesson = item.chapterId
      ? courseChapterById(course, item.chapterId)
      : course;
    if (lesson?.status === 'completed') return true;
    return preservePast && item.date < today;
  });
  const scheduledKeys = new Set(
    existing.map((item) => `${item.courseId}:${item.chapterId || ''}`),
  );
  const remaining = entries
    .filter(({ course, lesson }) => {
      const key = `${course.id}:${lesson.id || ''}`;
      return lesson.status !== 'completed' && !scheduledKeys.has(key);
    })
    .map(({ course, lesson }) => ({
      courseId: course.id,
      chapterId: lesson.id || '',
      title: lesson.title || course.title,
      plannedMinutes: Number(lesson.durationMinutes || 0),
    }));
  const startDate =
    plan.courseStartDate && plan.courseStartDate >= today
      ? plan.courseStartDate
      : today;
  const endDate =
    plan.courseTargetDate && plan.courseTargetDate >= startDate
      ? plan.courseTargetDate
      : coursePlanAddDays(startDate, 56);
  const dates = coursePlanStudyDates(
    startDate,
    '',
    plan.weeklyStudyDays,
    730,
  );
  const dailyTarget = Math.max(1, plan.dailyCourseTarget);
  const generated = [];
  let cursor = 0;
  for (const date of dates) {
    if (cursor >= remaining.length) break;
    const dailyItems = remaining.slice(cursor, cursor + dailyTarget);
    dailyItems.forEach((item, index) => {
      generated.push({
        id: createCourseResourceId('schedule'),
        date,
        courseId: item.courseId,
        chapterId: item.chapterId,
        plannedMinutes: item.plannedMinutes,
        order: index + 1,
        createdAt: Date.now(),
      });
    });
    cursor += dailyItems.length;
    if (date > endDate && cursor < remaining.length) {
      // Continue into later study days instead of marking the plan failed.
      continue;
    }
  }
  return [...existing, ...generated].sort(
    (left, right) =>
      left.date.localeCompare(right.date) || left.order - right.order,
  );
}

function rebuildCoursePlanSchedule(preservePast = true) {
  if (!state.studyPlan.coursePlanConfigured) return false;
  state.webCourses.courseSchedule = buildCoursePlanSchedule(
    state.studyPlan,
    preservePast,
  );
  state.studyPlan.coursePlanUpdatedAt = Date.now();
  scheduleSave();
  return true;
}

function courseScheduleEntriesWithState() {
  return normalizeCourseSchedule(state.webCourses.courseSchedule)
    .map((item) => {
      const course = courseById(item.courseId);
      const lesson = item.chapterId
        ? courseChapterById(course, item.chapterId)
        : course;
      if (!course || !lesson) return null;
      return {
        ...item,
        course,
        lesson,
        title: lesson.title || course.title,
        completed: lesson.status === 'completed',
        overdue:
          item.date < todayKey() && lesson.status !== 'completed',
      };
    })
    .filter(Boolean);
}

function setCourseResourceStatus(
  courseId,
  chapterId,
  statusValue,
  modalMode = 'chapters',
) {
  const course = courseById(courseId);
  if (!course) return;
  const status = normalizeCourseStatus(statusValue);
  const chapter = chapterId ? courseChapterById(course, chapterId) : null;
  const target = chapter || course;
  const previous = target.status;
  target.status = status;
  target.updatedAt = Date.now();
  if (status === 'completed') {
    target.progressPercent = 100;
    if (recordCourseCompletion(course, chapter)) {
      recordActivity('courses', `完成网课：${target.title || course.title}`);
    }
  } else if (status === 'learning') {
    target.progressPercent = Math.max(1, Number(target.progressPercent) || 0);
  } else if (status === 'unstarted' && previous === 'completed') {
    target.progressPercent = 0;
  }
  syncCourseGroupStatus(course);
  scheduleSave();
  if (els.backdrop && !els.backdrop.hidden) {
    render(true);
    if (modalMode === 'plan') openCoursePlanDashboard();
    else openCourseChapterManager(courseId);
  } else {
    render(true);
  }
  toast(`课程状态已更新为「${courseStatusLabel(status)}」`);
}

async function openLocalCoursePath(filePath) {
  try {
    const result = await bridge.openLocalCourseFile(filePath);
    if (!result?.ok) {
      throw new Error(result?.error || '本地课程无法打开');
    }
    return true;
  } catch (error) {
    toast(`本地课程无法打开：${error?.message || '文件可能已移动或删除'}`);
    return false;
  }
}

async function openCourseResource(courseId, chapterId = '') {
  const course = courseById(courseId);
  if (!course) {
    toast('课程记录不存在');
    return;
  }
  const chapter = chapterId ? courseChapterById(course, chapterId) : null;
  const lessons = courseLessonEntries(course);
  const lesson =
    chapter ||
    lessons.find((item) => item.status !== 'completed') ||
    lessons[0] ||
    null;
  if (!lesson) {
    toast('这门课程还没有可打开的资源，请先添加章节');
    return;
  }
  if (lesson.resourceType === 'local' && lesson.localPath) {
    const opened = await openLocalCoursePath(lesson.localPath);
    if (!opened) return;
    if (!course.chapters.includes(lesson)) {
      if (course.status === 'unstarted') course.status = 'learning';
    } else {
      lesson.status =
        lesson.status === 'unstarted' ? 'learning' : lesson.status;
      lesson.progressPercent = Math.max(1, lesson.progressPercent || 0);
    }
    recordLocalCourseVisit(course, lesson);
    syncCourseGroupStatus(course);
    scheduleSave();
    render(true);
  } else if (lesson.resourceType === 'bilibili' && lesson.url) {
    openSavedCourse(lesson.url);
  } else {
    toast('课程资源缺失，请编辑课程或重新选择本地文件');
  }
}

async function openRecentCourse(button) {
  const courseId = button.dataset.courseId || '';
  const chapterId = button.dataset.chapterId || '';
  if (courseId) {
    await openCourseResource(courseId, chapterId);
    return;
  }
  const localPath = button.dataset.localPath || '';
  if (localPath && (await openLocalCoursePath(localPath))) return;
  const url = button.dataset.url || '';
  if (isCourseLearningUrl(url)) {
    openSavedCourse(url);
    return;
  }
  toast('这条最近记录对应的资源已经不可用');
}

function openCourseEditor(courseId = '') {
  const course = courseId ? courseById(courseId) : null;
  const isNew = !course;
  openModal(`
    <h3>${isNew ? '新建课程' : '编辑课程'}</h3>
    <p class="panel-note">课程可以只保存名称和资料，之后再添加本地章节；新增资源只通过本地文件导入。</p>
    <div class="course-edit-form">
      <label>课程名称
        <input id="course-edit-title" type="text" maxlength="160"
          value="${esc(course?.title || '')}" placeholder="例如：大家的日语 N5 精讲" />
      </label>
      <label>来源
        <input id="course-edit-source" type="text" maxlength="80"
          value="${esc(course?.source || '本地文件')}" />
      </label>
      <label>分类
        <input id="course-edit-category" list="course-category-options" maxlength="40"
          value="${esc(course?.category || '综合日语')}" />
        <datalist id="course-category-options">${courseCategoryOptions(course?.category || '综合日语')}</datalist>
      </label>
      <label>JLPT 等级
        <select id="course-edit-level">
          ${COURSE_LEVELS.map(
            (level) =>
              `<option value="${esc(level)}"${level === (course?.level || '未分级') ? ' selected' : ''}>${esc(level)}</option>`,
          ).join('')}
        </select>
      </label>
      <label>预计时长（分钟）
        <input id="course-edit-duration" type="number" min="0" max="1440"
          step="1" value="${Number(course?.durationMinutes || 0)}" />
      </label>
      <label>学习状态
        <select id="course-edit-status">
          ${courseStatusOptions(course?.status || 'unstarted')}
        </select>
      </label>
      <label class="course-edit-notes">备注
        <textarea id="course-edit-notes" maxlength="2000"
          placeholder="记录教材、章节范围或学习目标">${esc(course?.notes || '')}</textarea>
      </label>
    </div>
    <div class="course-edit-resource">
      <strong>当前资源</strong>
      <span>${esc(courseResourceDescription(course))}</span>
    </div>
    <div class="modal-actions">
      ${
        course?.resourceType === 'local' && course?.localPath
          ? `<button class="small-button" type="button" data-action="course-replace-local" data-course-id="${esc(course.id)}">更换本地文件</button>`
          : ''
      }
      <button class="secondary-button" type="button" data-action="modal-cancel">取消</button>
      <button class="primary-button" type="button" data-action="course-save"
        data-course-id="${esc(course?.id || '')}">${isNew ? '创建课程' : '保存修改'}</button>
    </div>`);
}

function saveCourseFromModal() {
  const courseId = document.querySelector('[data-action="course-save"]')?.dataset.courseId || '';
  const title = document.getElementById('course-edit-title')?.value.trim() || '';
  if (!title) {
    toast('请填写课程名称');
    return;
  }
  const existing = courseId ? courseById(courseId) : null;
  const status = normalizeCourseStatus(
    document.getElementById('course-edit-status')?.value,
  );
  const now = Date.now();
  const course =
    existing || {
      id: createCourseResourceId(),
      kind: 'course',
      title,
      source: '本地文件',
      resourceType: 'local',
      url: '',
      localPath: '',
      durationMinutes: 0,
      category: '综合日语',
      notes: '',
      order: Math.max(0, ...state.webCourses.favorites.map((item) => item.order || 0)) + 1,
      level: '未分级',
      status: 'unstarted',
      addedAt: now,
      lastVisitedAt: 0,
      lastPositionSeconds: 0,
      lastPositionDuration: 0,
      lastPositionAt: 0,
      progressPercent: 0,
      chapters: [],
      updatedAt: now,
    };
  const previousStatus = course.status;
  course.title = title.slice(0, 160);
  course.source =
    document.getElementById('course-edit-source')?.value.trim().slice(0, 80) ||
    '本地文件';
  course.category = normalizeCourseCategory(
    document.getElementById('course-edit-category')?.value,
  );
  course.level = normalizeCourseLevel(
    document.getElementById('course-edit-level')?.value,
  );
  course.durationMinutes = normalizeCourseDurationMinutes(
    document.getElementById('course-edit-duration')?.value,
  );
  course.notes =
    document.getElementById('course-edit-notes')?.value.trim().slice(0, 2000) ||
    '';
  course.status = status;
  course.updatedAt = now;
  if (!existing) state.webCourses.favorites.push(course);
  if (status === 'completed' && previousStatus !== 'completed') {
    recordCourseCompletion(course, null);
  }
  syncCourseGroupStatus(course);
  if (state.studyPlan.coursePlanConfigured) {
    rebuildCoursePlanSchedule(true);
  }
  scheduleSave();
  closeModal();
  render();
  toast(existing ? '课程信息已更新' : '课程已创建');
}

function openCourseChapterManager(courseId) {
  const course = courseById(courseId);
  if (!course) return;
  const progress = courseProgressSummary(course);
  openModal(`
    <h3>章节管理 · ${esc(course.title)}</h3>
    <p class="panel-note">共 ${progress.total} 节，已完成 ${progress.completed} 节。章节资源只记录本地文件路径。</p>
    <div class="course-chapter-list">
      ${
        course.chapters.length
          ? course.chapters
              .map(
                (chapter, index) => `
            <article class="course-chapter-row">
              <span class="course-chapter-index">${index + 1}</span>
              <div class="course-chapter-copy">
                <strong>${esc(chapter.title)}</strong>
                <small>${chapter.durationMinutes || 0} 分钟 · ${chapter.localPath || '资源缺失'}</small>
              </div>
              <select data-course-chapter-status-course-id="${esc(course.id)}"
                data-course-chapter-id="${esc(chapter.id)}" aria-label="章节学习状态">
                ${courseStatusOptions(chapter.status)}
              </select>
              <button class="small-button" type="button" data-action="course-chapter-edit"
                data-course-id="${esc(course.id)}" data-chapter-id="${esc(chapter.id)}">编辑</button>
              <button class="small-button" type="button" data-action="course-chapter-order"
                data-course-id="${esc(course.id)}" data-chapter-id="${esc(chapter.id)}"
                data-direction="-1" ${index === 0 ? 'disabled' : ''}>↑</button>
              <button class="small-button" type="button" data-action="course-chapter-order"
                data-course-id="${esc(course.id)}" data-chapter-id="${esc(chapter.id)}"
                data-direction="1" ${index === course.chapters.length - 1 ? 'disabled' : ''}>↓</button>
              <button class="small-button" type="button" data-action="course-chapter-delete"
                data-course-id="${esc(course.id)}" data-chapter-id="${esc(chapter.id)}">删除</button>
            </article>`,
              )
              .join('')
          : '<div class="course-list-empty">还没有章节，请导入本地视频、音频或 PDF。</div>'
      }
    </div>
    <div class="modal-actions">
      <button class="primary-button" type="button" data-action="course-chapter-import"
        data-course-id="${esc(course.id)}">导入本地章节</button>
      <button class="secondary-button" type="button" data-action="modal-cancel">关闭</button>
    </div>`);
}

function openCourseChapterEditor(courseId, chapterId) {
  const course = courseById(courseId);
  const chapter = courseChapterById(course, chapterId);
  if (!course || !chapter) return;
  openModal(`
    <h3>编辑章节</h3>
    <div class="course-edit-form">
      <label>章节名称
        <input id="course-chapter-title" type="text" maxlength="160" value="${esc(chapter.title)}" />
      </label>
      <label>预计时长（分钟）
        <input id="course-chapter-duration" type="number" min="0" max="1440"
          value="${chapter.durationMinutes || 0}" />
      </label>
      <label>学习状态
        <select id="course-chapter-status">${courseStatusOptions(chapter.status)}</select>
      </label>
      <label class="course-edit-notes">备注
        <textarea id="course-chapter-notes" maxlength="1000">${esc(chapter.notes || '')}</textarea>
      </label>
    </div>
    <div class="course-edit-resource">
      <strong>本地资源</strong>
      <span>${esc(chapter.localPath || '资源缺失')}</span>
    </div>
    <div class="modal-actions">
      <button class="secondary-button" type="button" data-action="course-chapters"
        data-course-id="${esc(course.id)}">返回章节列表</button>
      <button class="primary-button" type="button" data-action="course-chapter-save"
        data-course-id="${esc(course.id)}" data-chapter-id="${esc(chapter.id)}">保存章节</button>
    </div>`);
}

function saveCourseChapterFromModal() {
  const saveButton = document.querySelector('[data-action="course-chapter-save"]');
  const course = courseById(saveButton?.dataset.courseId || '');
  const chapter = courseChapterById(course, saveButton?.dataset.chapterId || '');
  if (!course || !chapter) return;
  const title = document.getElementById('course-chapter-title')?.value.trim();
  if (!title) {
    toast('请填写章节名称');
    return;
  }
  const previous = chapter.status;
  chapter.title = title.slice(0, 160);
  chapter.durationMinutes = normalizeCourseDurationMinutes(
    document.getElementById('course-chapter-duration')?.value,
  );
  chapter.notes =
    document.getElementById('course-chapter-notes')?.value.trim().slice(0, 1000) ||
    '';
  chapter.status = normalizeCourseStatus(
    document.getElementById('course-chapter-status')?.value,
  );
  chapter.updatedAt = Date.now();
  if (chapter.status === 'completed') {
    chapter.progressPercent = 100;
    if (previous !== 'completed' && recordCourseCompletion(course, chapter)) {
      recordActivity('courses', `完成网课：${chapter.title}`);
    }
  }
  syncCourseGroupStatus(course);
  if (state.studyPlan.coursePlanConfigured) {
    rebuildCoursePlanSchedule(true);
  }
  scheduleSave();
  openCourseChapterManager(course.id);
  render(true);
  toast('章节已更新');
}

function courseImportErrorSummary(errors) {
  if (!errors?.length) return '';
  return errors
    .slice(0, 4)
    .map((item) => `${item.path || '文件'}：${item.error}`)
    .join('\n');
}

function showCourseImportErrors(errors) {
  if (!errors?.length) return;
  openModal(`
    <h3>部分文件未导入</h3>
    <p class="panel-note">成功导入的文件已经保存。以下文件因格式、路径或文件状态异常被跳过：</p>
    <div class="course-import-errors">
      ${errors
        .slice(0, 20)
        .map(
          (item) =>
            `<p><strong>${esc(item.path || '未知文件')}</strong><span>${esc(item.error || '无法读取')}</span></p>`,
        )
        .join('')}
    </div>
    <div class="modal-actions">
      <button class="secondary-button" type="button" data-action="modal-cancel">关闭</button>
    </div>`);
}

async function importLocalCourseResources(targetCourseId = '') {
  let result;
  try {
    result = await bridge.chooseLocalCourseFiles();
  } catch (error) {
    toast(`导入失败：${error?.message || '无法打开文件选择器'}`);
    return;
  }
  if (result?.canceled) return;
  if (!result?.ok || !Array.isArray(result.files) || !result.files.length) {
    toast(result?.error || '没有可导入的本地课程');
    return;
  }
  const now = Date.now();
  let added = 0;
  let skipped = 0;
  const errors = Array.isArray(result.errors) ? [...result.errors] : [];
  if (targetCourseId) {
    const course = courseById(targetCourseId);
    if (!course) {
      toast('目标课程不存在');
      return;
    }
    if (!course.chapters.length && (course.localPath || course.url)) {
      course.kind = 'course';
      course.chapters.push({
        id: createCourseResourceId('chapter'),
        title: course.title,
        resourceType: course.resourceType,
        url: course.url,
        localPath: course.localPath,
        durationMinutes: course.durationMinutes,
        order: 1,
        status: course.status,
        progressSeconds: course.lastPositionSeconds || 0,
        progressPercent: course.progressPercent || 0,
        notes: course.notes,
        updatedAt: now,
      });
      course.localPath = '';
      course.url = '';
      course.resourceType = 'local';
    }
    for (const file of result.files) {
      if (course.chapters.some((item) => courseResourceKey(item) === `local:${file.path.toLowerCase()}`)) {
        skipped += 1;
        continue;
      }
      course.chapters.push({
        id: createCourseResourceId('chapter'),
        title: file.name,
        resourceType: 'local',
        url: '',
        localPath: file.path,
        durationMinutes: 0,
        order: course.chapters.length + 1,
        status: 'unstarted',
        progressSeconds: 0,
        progressPercent: 0,
        notes: '',
        updatedAt: now,
      });
      added += 1;
    }
    syncCourseGroupStatus(course);
    course.updatedAt = now;
    if (state.studyPlan.coursePlanConfigured) {
      rebuildCoursePlanSchedule(true);
    }
    scheduleSave();
    render(true);
    openCourseChapterManager(course.id);
  } else if (result.files.length === 1) {
    const file = result.files[0];
    state.webCourses.favorites.push({
      id: createCourseResourceId(),
      kind: 'lesson',
      title: file.name,
      source: '本地文件',
      resourceType: 'local',
      url: '',
      localPath: file.path,
      durationMinutes: 0,
      category: '综合日语',
      notes: '',
      order: Math.max(0, ...state.webCourses.favorites.map((item) => item.order || 0)) + 1,
      level: '未分级',
      status: 'unstarted',
      addedAt: now,
      lastVisitedAt: 0,
      lastPositionSeconds: 0,
      lastPositionDuration: 0,
      lastPositionAt: 0,
      progressPercent: 0,
      chapters: [],
      updatedAt: now,
    });
    added = 1;
    scheduleSave();
    render();
  } else {
    const slash = Math.max(
      result.files[0].path.lastIndexOf('\\'),
      result.files[0].path.lastIndexOf('/'),
    );
    const folder =
      result.files[0].path.slice(0, slash).split(/[\\/]/).filter(Boolean).pop() ||
      '本地课程组';
    state.webCourses.favorites.push({
      id: createCourseResourceId(),
      kind: 'course',
      title: folder,
      source: '本地文件',
      resourceType: 'local',
      url: '',
      localPath: '',
      durationMinutes: 0,
      category: '综合日语',
      notes: '通过本地文件批量导入',
      order: Math.max(0, ...state.webCourses.favorites.map((item) => item.order || 0)) + 1,
      level: '未分级',
      status: 'unstarted',
      addedAt: now,
      lastVisitedAt: 0,
      lastPositionSeconds: 0,
      lastPositionDuration: 0,
      lastPositionAt: 0,
      progressPercent: 0,
      chapters: result.files.map((file, index) => ({
        id: createCourseResourceId('chapter'),
        title: file.name,
        resourceType: 'local',
        url: '',
        localPath: file.path,
        durationMinutes: 0,
        order: index + 1,
        status: 'unstarted',
        progressSeconds: 0,
        progressPercent: 0,
        notes: '',
        updatedAt: now,
      })),
      updatedAt: now,
    });
    added = result.files.length;
    const course = state.webCourses.favorites.at(-1);
    syncCourseGroupStatus(course);
    if (state.studyPlan.coursePlanConfigured) {
      rebuildCoursePlanSchedule(true);
    }
    scheduleSave();
    render();
  }
  toast(
    `已导入 ${added} 个本地资源${skipped ? `，跳过 ${skipped} 个重复文件` : ''}${errors.length ? `，${errors.length} 个文件失败` : ''}`,
  );
  if (errors.length) showCourseImportErrors(errors);
}

async function replaceLocalCourseFile(courseId) {
  const course = courseById(courseId);
  if (!course) return;
  let result;
  try {
    result = await bridge.chooseLocalCourseFiles();
  } catch (error) {
    toast(`选择文件失败：${error?.message || '请重试'}`);
    return;
  }
  if (result?.canceled) return;
  const file = result?.files?.[0];
  if (!file) {
    toast(result?.error || '没有选择有效文件');
    return;
  }
  course.localPath = file.path;
  course.resourceType = 'local';
  course.url = '';
  course.title = course.title || file.name;
  course.lastPositionSeconds = 0;
  course.progressPercent = 0;
  course.status = 'unstarted';
  course.updatedAt = Date.now();
  scheduleSave();
  closeModal();
  render();
  toast('本地课程文件已更换');
}

function moveCourseResource(courseId, direction) {
  const items = orderedCourseLibrary();
  if (!moveOrderedItem(items, courseId, direction)) return;
  state.webCourses.favorites = items;
  if (state.studyPlan.coursePlanConfigured) {
    rebuildCoursePlanSchedule(true);
  }
  scheduleSave();
  render(true);
}

function moveCourseChapter(courseId, chapterId, direction) {
  const course = courseById(courseId);
  if (!course || !moveOrderedItem(course.chapters, chapterId, direction)) return;
  if (state.studyPlan.coursePlanConfigured) {
    rebuildCoursePlanSchedule(true);
  }
  scheduleSave();
  render(true);
  openCourseChapterManager(courseId);
  toast('章节顺序已更新');
}

function confirmDeleteCourse(courseId) {
  const course = courseById(courseId);
  if (!course) return;
  openModal(`
    <h3>删除课程？</h3>
    <p>将删除「${esc(course.title)}」及其 ${course.chapters.length} 个章节记录。不会删除本地原始文件，也不会清除其他学习记录。</p>
    <div class="modal-actions">
      <button class="secondary-button" type="button" data-action="modal-cancel">取消</button>
      <button class="danger-button" type="button" data-action="course-delete-confirm"
        data-course-id="${esc(course.id)}">确认删除</button>
    </div>`);
}

function deleteCourseResource(courseId) {
  const before = state.webCourses.favorites.length;
  state.webCourses.favorites = state.webCourses.favorites.filter(
    (item) => item.id !== courseId,
  );
  if (state.webCourses.favorites.length === before) return;
  state.webCourses.courseSchedule = normalizeCourseSchedule(
    state.webCourses.courseSchedule,
  ).filter((item) => item.courseId !== courseId);
  if (state.studyPlan.coursePlanConfigured) {
    rebuildCoursePlanSchedule(false);
  }
  closeModal();
  scheduleSave();
  render();
  toast('课程已删除，本地文件未被删除');
}

function deleteCourseChapter(courseId, chapterId) {
  const course = courseById(courseId);
  if (!course) return;
  course.chapters = course.chapters.filter((item) => item.id !== chapterId);
  course.chapters.forEach((item, index) => {
    item.order = index + 1;
  });
  syncCourseGroupStatus(course);
  state.webCourses.courseSchedule = normalizeCourseSchedule(
    state.webCourses.courseSchedule,
  ).filter(
    (item) =>
      item.courseId !== courseId || item.chapterId !== chapterId,
  );
  if (state.studyPlan.coursePlanConfigured) {
    rebuildCoursePlanSchedule(false);
  }
  scheduleSave();
  render(true);
  openCourseChapterManager(courseId);
  toast('章节已删除，本地文件未被删除');
}

function scheduleCourseBrowserSync() {
  clearTimeout(courseBrowserSyncTimer);
  courseBrowserSyncTimer = setTimeout(syncCourseBrowser, 0);
}

async function syncCourseBrowser() {
  if (ui.route !== 'courses') {
    if (courseBrowserAttached) {
      courseBrowserAttached = false;
      await bridge.hideCourseBrowser().catch(() => {});
    }
    return;
  }
  const host = document.getElementById('course-browser-host');
  if (!host || courseBrowserState.error) {
    if (courseBrowserAttached) {
      courseBrowserAttached = false;
      await bridge.hideCourseBrowser().catch(() => {});
    }
    return;
  }
  const rect = host.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  try {
    const result = await bridge.showCourseBrowser({
      bounds: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      url: state.webCourses.lastUrl || COURSE_HOME_URL,
      forceLoad: courseBrowserForceLoad,
    });
    if (!result?.ok) {
      throw new Error(result?.error || '内置网课浏览器不可用');
    }
    courseBrowserForceLoad = false;
    courseBrowserAttached = Boolean(result.attached);
    courseBrowserState = { ...courseBrowserState, ...result, error: '' };
    updateCourseBrowserChrome();
  } catch (error) {
    courseBrowserAttached = false;
    await bridge.hideCourseBrowser().catch(() => {});
    courseBrowserState = {
      ...courseBrowserState,
      ok: false,
      attached: false,
      error: error?.message || '内置网课浏览器不可用',
    };
    render(true);
  }
}

function updateCourseBrowserChrome() {
  const title = document.getElementById('course-browser-title');
  const url = document.getElementById('course-browser-url');
  const indicator = document.getElementById('course-browser-indicator');
  const back = document.getElementById('course-back');
  const forward = document.getElementById('course-forward');
  const favorite = document.querySelector('[data-action="course-favorite"]');
  if (title) {
    title.textContent =
      courseBrowserState.title ||
      state.webCourses.lastTitle ||
      '正在打开 B站';
  }
  if (url) url.textContent = compactCourseUrl(currentCourseUrl());
  if (indicator) {
    indicator.classList.toggle('loading', Boolean(courseBrowserState.loading));
    indicator.textContent = courseBrowserState.loading
      ? '正在加载'
      : courseBrowserState.error
        ? '加载异常'
        : '已连接';
  }
  if (back) back.disabled = !courseBrowserState.canGoBack;
  if (forward) forward.disabled = !courseBrowserState.canGoForward;
  if (favorite) {
    favorite.disabled = !isCourseLearningUrl(courseBrowserState.url);
  }
}

function recordCourseVisit(nextState) {
  if (!isCourseLearningUrl(nextState?.url)) return false;
  const key = courseUrlKey(nextState.url);
  const title =
    String(nextState.title || state.webCourses.lastTitle || '未命名课程').slice(
      0,
      240,
    );
  const signature = `${key}|${title}`;
  if (!key || signature === courseRecordKey) return false;
  courseRecordKey = signature;
  const now = Date.now();
  const previousRecent = state.webCourses.recent.find(
    (item) => courseUrlKey(item.url) === key,
  );
  const favorite = state.webCourses.favorites.find(
    (item) => courseUrlKey(item.url) === key,
  );
  state.webCourses.recent = [
    {
      title,
      courseId: favorite?.id || previousRecent?.courseId || '',
      resourceType: 'bilibili',
      url: nextState.url,
      at: now,
      lastPositionSeconds: previousRecent?.lastPositionSeconds || 0,
      lastPositionDuration: previousRecent?.lastPositionDuration || 0,
    },
    ...state.webCourses.recent.filter((item) => courseUrlKey(item.url) !== key),
  ].slice(0, 12);
  state.webCourses.lastUrl = nextState.url;
  state.webCourses.lastTitle = title;
  if (favorite) {
    favorite.lastVisitedAt = now;
    favorite.title = title;
  }
  scheduleSave();
  return true;
}

function handleCourseBrowserState(nextState) {
  if (!nextState || typeof nextState !== 'object') return;
  const previousError = courseBrowserState.error;
  courseBrowserState = { ...courseBrowserState, ...nextState };
  if (
    nextState.event === 'load-error' ||
    nextState.event === 'render-process-gone'
  ) {
    courseBrowserAttached = false;
    bridge.hideCourseBrowser().catch(() => {});
    render(true);
    return;
  }
  if (
    nextState.event === 'start-loading' &&
    previousError &&
    !courseBrowserState.error
  ) {
    render(true);
    return;
  }
  const recorded = recordCourseVisit(courseBrowserState);
  if (recorded) {
    render(true);
    return;
  }
  updateCourseBrowserChrome();
}

async function searchCourse(query) {
  const keyword = String(query || '').trim();
  ui.courseQuery = keyword;
  if (!keyword) {
    toast('请输入要搜索的日语网课');
    return;
  }
  courseBrowserState = { ...courseBrowserState, error: '' };
  try {
    if (courseBrowserAttached) {
      const result = await bridge.searchCourse(keyword);
      if (result?.ok) {
        courseBrowserState = { ...courseBrowserState, ...result };
      }
    } else {
      const url = new URL('https://search.bilibili.com/all');
      url.searchParams.set('keyword', keyword);
      state.webCourses.lastUrl = url.toString();
      courseBrowserForceLoad = true;
    }
    render(true);
  } catch (error) {
    toast(`搜索失败：${error?.message || '请重试'}`);
  }
}

async function openSavedCourse(url) {
  if (!isAllowedBilibiliUrl(url)) {
    toast('该链接不是受支持的 B站地址');
    return;
  }
  courseBrowserState = { ...courseBrowserState, error: '' };
  state.webCourses.lastUrl = url;
  state.webCourses.lastTitle =
    state.webCourses.favorites.find(
      (item) => courseUrlKey(item.url) === courseUrlKey(url),
    )?.title ||
    state.webCourses.recent.find(
      (item) => courseUrlKey(item.url) === courseUrlKey(url),
    )?.title ||
    '';
  courseBrowserForceLoad = true;
  render();
}

async function captureCurrentCoursePosition() {
  if (!isCourseLearningUrl(courseBrowserState.url)) {
    toast('请先打开一个 B站课程视频页面');
    return null;
  }
  try {
    const result = await bridge.captureCoursePosition();
    if (!result?.ok) {
      throw new Error(result?.error || '无法读取当前播放位置');
    }
    const position = result.position || {};
    const seconds = normalizeCoursePositionSeconds(position.seconds);
    const duration = normalizeCoursePositionSeconds(position.duration);
    if (!seconds) {
      throw new Error('播放器还没有可记录的学习位置');
    }
    const url = isAllowedBilibiliUrl(result.url)
      ? result.url
      : courseBrowserState.url;
    const key = courseUrlKey(url);
    const favorite = state.webCourses.favorites.find(
      (item) => courseUrlKey(item.url) === key,
    );
    const recent = state.webCourses.recent.find(
      (item) => courseUrlKey(item.url) === key,
    );
    if (favorite) {
      favorite.lastPositionSeconds = seconds;
      favorite.lastPositionDuration = duration;
      favorite.lastPositionAt = Date.now();
      favorite.lastVisitedAt = Date.now();
    }
    if (recent) {
      recent.lastPositionSeconds = seconds;
      recent.lastPositionDuration = duration;
    }
    return { favorite, seconds, duration };
  } catch (error) {
    toast(error?.message || '无法记录当前播放位置');
    return null;
  }
}

async function recordCurrentCoursePosition() {
  const result = await captureCurrentCoursePosition();
  if (!result?.favorite) {
    toast('请先收藏当前课程，再记录播放位置');
    return;
  }
  scheduleSave();
  render(true);
  toast(`已记录播放位置 ${formatCoursePosition(result.seconds, result.duration)}`);
}

async function addCurrentCourseFavorite() {
  if (!isCourseLearningUrl(courseBrowserState.url)) {
    toast('请先在 B站打开一个课程视频页面');
    return;
  }
  const key = courseUrlKey(courseBrowserState.url);
  if (
    state.webCourses.favorites.some(
      (item) => courseUrlKey(item.url) === key,
    )
  ) {
    toast('这个课程已经在收藏中');
    return;
  }
  const levelSelect = document.getElementById('course-save-level');
  const level = normalizeCourseLevel(
    levelSelect?.value || ui.courseSaveLevel,
  );
  ui.courseSaveLevel = level;
  const captured = await captureCurrentCoursePosition();
  state.webCourses.favorites.push({
    id: createCourseResourceId(),
    kind: 'lesson',
    title:
      courseBrowserState.title ||
      state.webCourses.lastTitle ||
      '未命名课程',
    source: 'Bilibili',
    resourceType: 'bilibili',
    url: courseBrowserState.url,
    localPath: '',
    durationMinutes: 0,
    category: '综合日语',
    notes: '',
    order:
      Math.max(0, ...state.webCourses.favorites.map((item) => item.order || 0)) +
      1,
    level,
    status: 'unstarted',
    addedAt: Date.now(),
    lastVisitedAt: Date.now(),
    lastPositionSeconds: captured?.seconds || 0,
    lastPositionDuration: captured?.duration || 0,
    lastPositionAt: captured?.seconds ? Date.now() : 0,
    progressPercent: 0,
    chapters: [],
    updatedAt: Date.now(),
  });
  if (state.studyPlan.coursePlanConfigured) {
    rebuildCoursePlanSchedule(true);
  }
  scheduleSave();
  render(true);
  toast('已收藏当前课程');
}

function updateCourseFavoriteStatus(id, status) {
  setCourseResourceStatus(id, '', status);
}

function removeCourseFavorite(id) {
  const before = state.webCourses.favorites.length;
  state.webCourses.favorites = state.webCourses.favorites.filter(
    (item) => item.id !== id,
  );
  if (state.webCourses.favorites.length === before) return;
  scheduleSave();
  render(true);
  toast('已移除课程收藏');
}

async function openCourseExternal(url = currentCourseUrl()) {
  try {
    const result = await bridge.openCourseExternal(url);
    if (!result?.ok) throw new Error(result?.error || '无法打开系统浏览器');
  } catch (error) {
    toast(`打开失败：${error?.message || '请检查系统浏览器'}`);
  }
}

async function controlCourseBrowser(action) {
  try {
    const result = await bridge.controlCourse(action);
    if (result?.ok) {
      courseBrowserState = {
        ...courseBrowserState,
        ...result,
        error: '',
      };
      updateCourseBrowserChrome();
    }
  } catch (error) {
    toast(`网课页面操作失败：${error?.message || '请重试'}`);
  }
}

function retryCourseBrowser() {
  courseBrowserState = { ...courseBrowserState, error: '' };
  courseBrowserForceLoad = true;
  render(true);
}

function kanaRowsFor(groupId) {
  return KANA_ROWS.filter((row) => row.group === groupId);
}

function kanaRowHtml(row) {
  const cells = [...row.cells];
  while (cells.length < 5) cells.push(null);
  return `
    <div class="kana-row">
      <div class="kana-row-label">${row.label}</div>
      ${cells
        .map((cell) => {
          if (!cell) return '<div class="empty-cell"></div>';
          const learned = Boolean(state.kana[cell.id]);
          const selected = ui.selectedKana === cell.id;
          return `
            <button class="kana-cell${learned ? ' learned' : ''}${selected ? ' selected' : ''}"
              type="button" data-action="kana-select" data-kana-id="${esc(cell.id)}"
              aria-label="${esc(cell.hira)}，读作 ${esc(cell.romaji)}${learned ? '，已掌握' : ''}"
              aria-pressed="${learned}">
              <span class="kana-char">${esc(cell.hira)}</span>
              <span class="kana-romaji">${esc(cell.romaji)}</span>
            </button>`;
        })
        .join('')}
    </div>`;
}

function renderKana() {
  const groups = ui.kanaGroup === 'all' ? KANA_GROUPS : KANA_GROUPS.filter((group) => group.id === ui.kanaGroup);
  const learned = learnedKanaCount();
  const missingBundledAudio = kanaBundledAudioMissing();
  const voiceUnavailable =
    missingBundledAudio > 0 && systemSpeechUnavailable();
  const selected = ui.selectedKana
    ? KANA_CELLS.find((cell) => cell.id === ui.selectedKana) ?? null
    : null;
  const selectedRow = selected
    ? KANA_ROWS.find((row) => row.cells.some((cell) => cell && cell.id === selected.id))
    : null;
  const selectedLearned = selected ? Boolean(state.kana[selected.id]) : false;

  const sections = groups
    .map((group) => {
      const rows = kanaRowsFor(group.id);
      const cells = rows.flatMap((row) => row.cells.filter(Boolean));
      const done = cells.filter((cell) => state.kana[cell.id]).length;
      return `
        <section class="kana-section">
          <div class="kana-section-head">
            <span class="kana-section-title">${group.label}</span>
            <span class="kana-section-note">${group.note} · 已掌握 ${done}/${cells.length}</span>
          </div>
          ${rows.map(kanaRowHtml).join('')}
        </section>`;
    })
    .join('');

  return `
    <div class="page${ui.hideRomaji ? ' hide-romaji' : ''}">
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="假名分类">
          <button class="segment-button${ui.kanaGroup === 'all' ? ' active' : ''}" type="button"
            data-action="kana-group" data-group="all">全部</button>
          ${KANA_GROUPS.map(
            (group) => `
            <button class="segment-button${ui.kanaGroup === group.id ? ' active' : ''}" type="button"
              data-action="kana-group" data-group="${group.id}">${group.label}</button>`,
          ).join('')}
        </div>
        <span class="spacer"></span>
        <span class="panel-note">已掌握 ${learned}/${KANA_TOTAL} · 点击假名朗读</span>
        <button class="small-button" type="button" data-action="kana-random">随机抽一个</button>
        <button class="small-button" type="button" data-action="kana-romaji" aria-pressed="${ui.hideRomaji}">
          ${ui.hideRomaji ? '显示罗马音' : '隐藏罗马音'}
        </button>
      </div>

      ${
        voiceUnavailable
          ? `<div class="voice-warning">
              <div>
                <strong>${missingBundledAudio} 个假名缺少内置录音</strong>
                <p>这些缺失项需要 Android 日语 TTS 后备，但当前系统也无法使用日语 TTS。</p>
              </div>
              <button class="small-button" type="button" data-action="voice-help">查看后备语音说明</button>
            </div>`
          : ''
      }

      <div class="kana-layout">
        <div>${sections}</div>
        <aside class="kana-detail">
          ${
            selected
              ? `
            <div class="kana-big">
              <div class="kana-pair">
                <span>${esc(selected.hira)}</span>
                <span>${esc(selected.kata)}</span>
              </div>
            </div>
            <div class="kana-romaji-big">${esc(selected.romaji)}</div>
            <div class="kana-detail-meta">
              ${GROUP_LABELS[selected.group] ?? ''} · ${selectedRow ? esc(selectedRow.label) : ''}<br />
              ${selectedLearned ? '已标记为掌握' : '还没有标记掌握'}
            </div>
            <div class="kana-detail-actions">
              <button class="${selectedLearned ? 'secondary-button' : 'primary-button'}" type="button"
                data-action="kana-toggle" data-kana-id="${esc(selected.id)}">
                ${selectedLearned ? '取消掌握' : '标记已掌握'}
              </button>
              <button class="small-button" type="button" data-action="speak" data-text="${esc(selected.hira)}">
                朗读
              </button>
              <button class="small-button shadow-entry" type="button" data-action="shadow-open"
                data-shadow-text="${esc(selected.hira)}"
                data-shadow-reading="${esc(selected.hira)}"
                data-shadow-has-reading="true"
                data-shadow-zh="${esc(selected.romaji)} · 假名">
                跟读录音
              </button>
            </div>`
              : `
            <div class="kana-detail-empty">
              <div class="empty-mark">あ</div>
              点选左侧任意假名，这里会显示平假名、片假名和罗马音。标记掌握后会记录到本地。
            </div>`
          }
        </aside>
      </div>
      <footer class="kana-audio-attribution">
        <strong>发音说明：</strong>
        五十音图已改用真人发音。受可用公开录音来源限制，个别假名无法完全统一音色。
        主要音频来自 Just Gojuon（MIT License，Copyright © 2025 Levon，
        github.com/veardk/just-gojuon）；「を」采用同一资源中「お」的同音真人录音。
      </footer>
    </div>`;
}

function renderPagination({
  className,
  ariaLabel,
  action,
  currentPage,
  pageCount,
  pageStart,
  visibleCount,
  totalCount,
}) {
  const pageMarkers = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, pageCount])]
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((a, b) => a - b);

  return `
    <nav class="${className}" aria-label="${esc(ariaLabel)}">
      <span class="pagination-summary">
        第 ${pageStart + 1}–${pageStart + visibleCount} 条
        <span>共 ${totalCount} 条</span>
      </span>
      <div class="pagination-actions">
        <button class="page-button" type="button" data-action="${action}"
          data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
        <div class="page-number-list">
          ${pageMarkers
            .map(
              (page, index) => `
            ${
              index > 0 && page - pageMarkers[index - 1] > 1
                ? '<span class="page-gap">…</span>'
                : ''
            }
            <button class="page-button page-number${page === currentPage ? ' active' : ''}" type="button"
              data-action="${action}" data-page="${page}" aria-label="第 ${page} 页"
              ${page === currentPage ? 'aria-current="page"' : ''}>${page}</button>`,
            )
            .join('')}
        </div>
        <button class="page-button" type="button" data-action="${action}"
          data-page="${currentPage + 1}" ${currentPage >= pageCount ? 'disabled' : ''}>下一页</button>
      </div>
    </nav>`;
}

function filteredWords() {
  const query = ui.wordQuery.trim().toLowerCase();
  return CONTENT_WORDS.filter((word) => {
    if (ui.wordFilter === 'mastered' && !state.words[word.id]) return false;
    if (ui.wordFilter === 'learning' && state.words[word.id]) return false;
    if (ui.wordLevel !== 'all' && word.level !== ui.wordLevel) return false;
    if (ui.wordPos !== 'all' && word.pos !== ui.wordPos) return false;
    if (ui.wordTheme !== 'all' && !word.themes.includes(ui.wordTheme)) {
      return false;
    }
    if (!query) return true;
    return word.searchText.includes(query);
  });
}

function renderWords() {
  const list = filteredWords();
  const pageCount = Math.max(1, Math.ceil(list.length / WORD_PAGE_SIZE));
  const currentPage = Math.min(Math.max(ui.wordPage, 1), pageCount);
  ui.wordPage = currentPage;
  const pageStart = (currentPage - 1) * WORD_PAGE_SIZE;
  const visible = list.slice(pageStart, pageStart + WORD_PAGE_SIZE);
  const selected = visible.find((word) => word.id === ui.selectedWord) ?? visible[0] ?? null;
  if (selected) ui.selectedWord = selected.id;
  const selectedMastered = selected ? Boolean(state.words[selected.id]) : false;
  const themeShortcuts = WORD_THEME_SHORTCUTS.filter((theme) =>
    CONTENT_WORD_THEMES.includes(theme),
  );
  const themeNeedsAdvanced =
    ui.wordTheme !== 'all' && !themeShortcuts.includes(ui.wordTheme);
  const hasActiveFilters =
    ui.wordFilter !== 'all' ||
    ui.wordLevel !== 'all' ||
    ui.wordPos !== 'all' ||
    ui.wordTheme !== 'all';
  const filterSummary = [
    ui.wordFilter === 'learning' ? '只看学习中' : '',
    ui.wordFilter === 'mastered' ? '只看已掌握' : '',
    ui.wordLevel !== 'all' ? `JLPT ${ui.wordLevel}` : '',
    ui.wordPos !== 'all' ? ui.wordPos : '',
    ui.wordTheme !== 'all' ? ui.wordTheme : '',
  ]
    .filter(Boolean)
    .join(' · ') || '全部分类';
  return `
    <div class="page">
      <div class="toolbar">
        <input class="search-input" id="word-search" type="search" autocomplete="off"
          placeholder="搜索日语、假名或中文" value="${esc(ui.wordQuery)}" aria-label="搜索词汇" />
        <div class="segmented" role="group" aria-label="词汇筛选">
          ${[
            ['all', '全部'],
            ['learning', '学习中'],
            ['mastered', '已掌握'],
          ]
            .map(
              ([id, label]) => `
            <button class="segment-button${ui.wordFilter === id ? ' active' : ''}" type="button"
              data-action="word-filter" data-filter="${id}">${label}</button>`,
            )
            .join('')}
        </div>
        <span class="spacer"></span>
        <span class="panel-note">第 ${currentPage} / ${pageCount} 页 · 本页 ${visible.length} 条</span>
      </div>
      <div class="word-filter-panel">
        <div class="word-filter-heading">
          <div>
            <strong>分类浏览</strong>
            <span class="panel-note">等级为内容层标注，非官方固定必考清单。</span>
          </div>
          <span class="word-filter-result">筛选结果 ${list.length} 条 · 全库 ${WORD_TOTAL} 个 · 已掌握 ${masteredWordCount()}</span>
        </div>
        <div class="word-level-filter" role="group" aria-label="按 JLPT 等级筛选">
          <span class="word-filter-label">等级</span>
          ${[
            ['all', '全部'],
            ...CONTENT_LEVELS.map((level) => [level, level]),
          ]
            .map(
              ([value, label]) => `
            <button class="word-level-chip${ui.wordLevel === value ? ' active' : ''}" type="button"
              data-action="word-level" data-level="${esc(value)}">${esc(label)}</button>`,
            )
            .join('')}
        </div>
        <div class="word-filter-fields">
          <label class="compact-filter">词性
            <select id="word-pos-filter">${selectOptions(CONTENT_WORD_POS, ui.wordPos)}</select>
          </label>
          <div class="word-theme-filter">
            <span class="word-filter-label">常用主题</span>
            <div class="word-theme-shortcuts" role="group" aria-label="按常用主题筛选">
              ${[
                ['all', '全部'],
                ...themeShortcuts.map((theme) => [theme, theme]),
              ]
                .map(
                  ([value, label]) => `
                <button class="word-level-chip${ui.wordTheme === value ? ' active' : ''}" type="button"
                  data-action="word-theme" data-theme="${esc(value)}">${esc(label)}</button>`,
                )
                .join('')}
            </div>
            <details class="word-theme-more" ${themeNeedsAdvanced ? 'open' : ''}>
              <summary>全部 ${CONTENT_WORD_THEMES.length} 个主题${themeNeedsAdvanced ? ` · ${esc(ui.wordTheme)}` : ''}</summary>
              <label class="compact-filter">选择主题
                <select id="word-theme-filter">${selectOptions(CONTENT_WORD_THEMES, ui.wordTheme)}</select>
              </label>
            </details>
          </div>
          <div class="word-filter-summary">
            <span>当前：${esc(filterSummary)}</span>
            ${
              hasActiveFilters
                ? `<button class="word-filter-clear" type="button" data-action="word-filter-clear">清除分类</button>`
                : ''
            }
          </div>
        </div>
      </div>

      ${
        list.length
          ? `
        <div class="word-layout">
          <div class="word-results">
            <div class="word-table">
              ${visible
                .map((word) => {
                  const mastered = Boolean(state.words[word.id]);
                  const wordRomaji = word.romaji || romajiHint(word.kana, word.kana);
                  return `
                  <button class="word-row${selected && selected.id === word.id ? ' selected' : ''}" type="button"
                    data-action="word-select" data-word-id="${word.id}">
                    <span>
                      <span class="word-main">${esc(word.word)}</span>
                      ${kanaPairMarkup(word.kana)}
                      <span class="word-romaji">${esc(wordRomaji)}</span>
                    </span>
                    <span class="word-tags">
                      <span class="word-badge">${esc(word.pos)}</span>
                      <span class="word-badge level-badge">${esc(word.level)}</span>
                      ${themeBadges(word.themes.slice(0, 2))}
                    </span>
                    <span class="word-meaning">${esc(word.meaning)}</span>
                    <span class="word-badge${mastered ? ' mastered' : ''}">${mastered ? '已掌握' : '学习中'}</span>
                  </button>`;
                })
                .join('')}
            </div>
            ${renderPagination({
              className: 'word-pagination',
              ariaLabel: '词汇分页',
              action: 'word-page',
              currentPage,
              pageCount,
              pageStart,
              visibleCount: visible.length,
              totalCount: list.length,
            })}
          </div>

          <aside class="word-detail">
            ${
              selected
                ? `
              <div class="detail-word">${esc(selected.word)}</div>
              <div class="detail-kana">
                ${kanaPairMarkup(selected.kana, 'detail', true)}
                <span class="detail-romaji">罗马音 · ${esc(selected.romaji || romajiHint(selected.kana, selected.kana))}</span>
              </div>
              <div class="detail-meta-tags">
                <span class="word-badge">${esc(selected.pos)}</span>
                <span class="word-badge level-badge">JLPT ${esc(selected.level)}</span>
                ${themeBadges(selected.themes)}
              </div>
              <div class="detail-label">中文释义</div>
              <div class="detail-meaning">${esc(selected.meaning)}</div>
              <div class="detail-label">例句</div>
              <div class="example-list example-study-list">
                ${selected.examples
                  .map((example, index) =>
                    renderExampleStudyCard(example, selected.id, index),
                  )
                  .join('')}
              </div>
              <div class="detail-actions">
                <button class="${selectedMastered ? 'secondary-button' : 'primary-button'}" type="button"
                  data-action="word-toggle" data-word-id="${selected.id}">
                  ${selectedMastered ? '取消掌握' : '标记已掌握'}
                </button>
                <button class="small-button" type="button" data-action="speak" data-text="${esc(selected.kana)}">
                  朗读
                </button>
                <button class="small-button shadow-entry" type="button" data-action="shadow-open"
                  data-shadow-text="${esc(selected.word)}"
                  data-shadow-audio-text="${esc(selected.kana)}"
                  data-shadow-reading="${esc(selected.kana)}"
                  data-shadow-has-reading="true"
                  data-shadow-zh="${esc(selected.meaning)}">
                  跟读单词
                </button>
              </div>`
                : `<div class="empty"><div class="empty-mark">語</div>没有找到匹配的词汇。</div>`
            }
          </aside>
        </div>`
          : `<div class="panel"><div class="empty"><div class="empty-mark">語</div>没有找到匹配的词汇，换个关键词试试。</div></div>`
      }
    </div>`;
}

function filteredGrammar() {
  const query = ui.grammarQuery.trim().toLowerCase();
  return CONTENT_GRAMMAR.filter((lesson) => {
    if (ui.grammarLevel !== 'all' && lesson.level !== ui.grammarLevel) {
      return false;
    }
    if (
      ui.grammarFunction !== 'all' &&
      !lesson.functions.includes(ui.grammarFunction)
    ) {
      return false;
    }
    if (!query) return true;
    return [
      lesson.title,
      lesson.structure,
      lesson.explanation,
      lesson.usage,
      lesson.notes,
      ...lesson.functions,
    ]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });
}

function renderGrammar() {
  const lesson = ui.lessonId ? CONTENT_GRAMMAR_BY_ID[ui.lessonId] : null;
  if (lesson) return renderLesson(lesson);
  const list = filteredGrammar();
  const pageCount = Math.max(1, Math.ceil(list.length / GRAMMAR_PAGE_SIZE));
  const currentPage = Math.min(Math.max(ui.grammarPage, 1), pageCount);
  ui.grammarPage = currentPage;
  const pageStart = (currentPage - 1) * GRAMMAR_PAGE_SIZE;
  const visible = list.slice(pageStart, pageStart + GRAMMAR_PAGE_SIZE);
  const done = list.filter((item) => state.grammar[item.id]).length;
  const functionShortcuts = GRAMMAR_FUNCTION_SHORTCUTS.filter((name) =>
    CONTENT_GRAMMAR_FUNCTIONS.includes(name),
  );
  const functionNeedsAdvanced =
    ui.grammarFunction !== 'all' &&
    !functionShortcuts.includes(ui.grammarFunction);
  const hasActiveFilters =
    ui.grammarLevel !== 'all' || ui.grammarFunction !== 'all';
  const filterSummary = [
    ui.grammarLevel !== 'all' ? `JLPT ${ui.grammarLevel}` : '',
    ui.grammarFunction !== 'all' ? ui.grammarFunction : '',
  ]
    .filter(Boolean)
    .join(' · ') || '全部分类';

  return `
    <div class="page">
      <div class="toolbar">
        <input class="search-input" id="grammar-search" type="search" autocomplete="off"
          placeholder="搜索语法、接续或功能" value="${esc(ui.grammarQuery)}" aria-label="搜索语法" />
        <span class="spacer"></span>
        <span class="panel-note">第 ${currentPage} / ${pageCount} 页 · 本页 ${visible.length} 条</span>
        <button class="small-button" type="button" data-action="open-next-lesson">继续下一课</button>
      </div>
      <div class="grammar-filter-panel">
        <div class="grammar-filter-heading">
          <div>
            <strong>语法分类</strong>
            <span class="panel-note">等级为内容层标注，非官方固定必考清单；功能分类可多选归类。</span>
          </div>
          <span class="grammar-filter-result">筛选结果 ${list.length} 条 · 全库 ${GRAMMAR_TOTAL} 个 · 已完成 ${done}</span>
        </div>
        <div class="grammar-level-filter" role="group" aria-label="按 JLPT 等级筛选">
          <span class="grammar-filter-label">等级</span>
          ${[
            ['all', '全部'],
            ...CONTENT_LEVELS.map((level) => [level, level]),
          ]
            .map(
              ([value, label]) => `
            <button class="grammar-filter-chip${ui.grammarLevel === value ? ' active' : ''}" type="button"
              data-action="grammar-level" data-level="${esc(value)}">${esc(label)}</button>`,
            )
            .join('')}
        </div>
        <div class="grammar-filter-fields">
          <div class="grammar-function-filter">
            <span class="grammar-filter-label">常用功能</span>
            <div class="grammar-function-shortcuts" role="group" aria-label="按常用语法功能筛选">
              ${[
                ['all', '全部'],
                ...functionShortcuts.map((name) => [name, name]),
              ]
                .map(
                  ([value, label]) => `
                <button class="grammar-filter-chip${ui.grammarFunction === value ? ' active' : ''}" type="button"
                  data-action="grammar-function" data-function="${esc(value)}">${esc(label)}</button>`,
                )
                .join('')}
            </div>
            <details class="grammar-function-more" ${functionNeedsAdvanced ? 'open' : ''}>
              <summary>全部 ${CONTENT_GRAMMAR_FUNCTIONS.length} 个功能${functionNeedsAdvanced ? ` · ${esc(ui.grammarFunction)}` : ''}</summary>
              <label class="compact-filter">选择功能
                <select id="grammar-function-filter">${selectOptions(CONTENT_GRAMMAR_FUNCTIONS, ui.grammarFunction)}</select>
              </label>
            </details>
          </div>
          <div class="grammar-filter-summary">
            <span>当前：${esc(filterSummary)}</span>
            ${
              hasActiveFilters
                ? `<button class="grammar-filter-clear" type="button" data-action="grammar-filter-clear">清除分类</button>`
                : ''
            }
          </div>
        </div>
      </div>

      ${
        list.length
          ? `
        <div class="lesson-grid">
          ${visible.map((item) => {
            const record = state.grammar[item.id];
            return `
            <button class="lesson-card" type="button" data-action="lesson-open" data-lesson-id="${item.id}">
              <span class="lesson-top">
                <span class="lesson-number">第 ${String(item.order).padStart(2, '0')} 课 · ${esc(item.level)}</span>
                <span class="lesson-status${record ? ' done' : ''}">${record ? '已完成' : '未开始'}</span>
              </span>
              <span class="lesson-title">${esc(item.title)}</span>
              <span class="lesson-structure">${esc(item.structure)}</span>
              <span class="lesson-functions">${themeBadges(item.functions)}</span>
              <span class="lesson-explain">${esc(item.explanation.slice(0, 46))}…</span>
            </button>`;
          }).join('')}
        </div>
        ${renderPagination({
          className: 'grammar-pagination',
          ariaLabel: '语法分页',
          action: 'grammar-page',
          currentPage,
          pageCount,
          pageStart,
          visibleCount: visible.length,
          totalCount: list.length,
        })}`
          : '<div class="panel"><div class="empty"><div class="empty-mark">文</div>没有找到匹配的语法点。</div></div>'
      }
    </div>`;
}

function questionById(questionId) {
  return CONTENT_QUESTION_BY_ID[questionId] ?? null;
}

function normalizeAnswer(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[。、，,.！!？?]/g, '');
}

function renderLesson(lesson) {
  const index = lesson.order - 1;
  const record = state.grammar[lesson.id];
  const answered = lesson.exercises.filter(
    (question) => ui.lessonResults[question.id] === true,
  ).length;

  return `
    <div class="page">
      <div class="lesson-detail">
        <button class="back-button" type="button" data-action="lesson-back">← 返回语法列表</button>
        <h2>${esc(lesson.title)}</h2>
        <div class="structure-line">${esc(lesson.structure)}</div>
        <p class="panel-note">
          第 ${String(index + 1).padStart(2, '0')} 课 · ${esc(lesson.level)}
          ${record ? ' · 已完成' : ''}
        </p>
        <div class="detail-meta-tags">
          ${themeBadges(lesson.functions)}
        </div>

        <div class="lesson-section">
          <h3>怎么用</h3>
          <p>${esc(lesson.usage)}</p>
        </div>

        <div class="lesson-section">
          <h3>说明</h3>
          <p>${esc(lesson.explanation)}</p>
        </div>

        <div class="lesson-section">
          <h3>例句</h3>
          <div class="example-list example-study-list">
            ${lesson.examples
              .map((example, index) =>
                renderExampleStudyCard(example, '', index),
              )
              .join('')}
          </div>
        </div>

        <div class="lesson-section">
          <h3>注意</h3>
          <div class="note-box">${esc(lesson.notes)}</div>
        </div>

        <div class="lesson-section">
          <div class="section-head" style="margin:0 0 12px">
            <div>
              <h3 style="margin:0">随堂练习</h3>
              <p class="panel-note">答完全部 ${lesson.exercises.length} 题后自动完成本课（当前 ${answered} 题正确）</p>
            </div>
          </div>
          <div class="question-list">
            ${lesson.exercises.map((question) => renderLessonQuestion(question)).join('')}
          </div>
        </div>

        <div class="detail-actions">
          <button class="secondary-button" type="button" data-action="lesson-complete" data-lesson-id="${lesson.id}">
            ${record ? '更新完成记录' : '标记为已学完'}
          </button>
        </div>
      </div>
    </div>`;
}

function renderLessonQuestion(question) {
  const isChoice = question.type === 'choice';
  return `
    <div class="question-inline" data-question-id="${question.id}">
      <div class="prompt">${esc(question.prompt)}</div>
      ${
        isChoice
          ? `<div class="option-row">
              ${question.options
                .map(
                  (option) => `
                <button class="option-button" type="button" data-action="lesson-option"
                  data-qid="${question.id}" data-value="${esc(option)}">${esc(option)}</button>`,
                )
                .join('')}
            </div>`
          : `<div class="fill-row">
              <input class="answer-input" id="fill-${question.id}" type="text" autocomplete="off"
                placeholder="填入缺少的词" aria-label="${esc(question.prompt)}" />
              <button class="primary-button" type="button" data-action="lesson-check" data-qid="${question.id}">
                检查
              </button>
            </div>`
      }
      <div class="question-feedback" hidden></div>
    </div>`;
}

function markLessonComplete(lesson, silent = false) {
  const total = lesson.exercises.length;
  const correct = lesson.exercises.filter(
    (question) => ui.lessonResults[question.id] === true,
  ).length;
  const existed = Boolean(state.grammar[lesson.id]);
  state.grammar[lesson.id] = { score: correct, total, at: Date.now() };
  scheduleInitialReview(
    'grammar',
    lesson.id,
    state.grammar[lesson.id].at,
  );
  if (!existed) {
    recordActivity('grammar', `完成语法：${lesson.title}`);
    setSaveStatus('saving');
  }
  scheduleSave();
  renderNav();
  if (!silent) toast(existed ? '已更新完成记录' : '语法点已完成');
}

function checkLessonQuestion(questionId, container, rawValue) {
  const question = questionById(questionId);
  if (!question) return;
  const value = String(rawValue ?? '');
  const correct =
    question.type === 'choice'
      ? value === question.answer
      : (question.answers || []).some((answer) => normalizeAnswer(answer) === normalizeAnswer(value));
  const feedback = container.querySelector('.question-feedback');

  if (correct) {
    ui.lessonResults[questionId] = true;
    container.querySelectorAll('.option-button').forEach((button) => {
      button.disabled = true;
      if (button.dataset.value === question.answer) button.classList.add('correct');
    });
    const input = container.querySelector('input');
    const checkButton = container.querySelector('[data-action="lesson-check"]');
    if (input) input.disabled = true;
    if (checkButton) checkButton.disabled = true;
    feedback.hidden = false;
    feedback.className = 'question-feedback ok';
    feedback.innerHTML = `<strong>答对了</strong>${esc(question.explanation)}`;

    const lesson = question.lessonId ? CONTENT_GRAMMAR_BY_ID[question.lessonId] : null;
    if (lesson) {
      const allCorrect = lesson.exercises.every(
        (questionItem) => ui.lessonResults[questionItem.id] === true,
      );
      if (allCorrect && !state.grammar[lesson.id]) {
        markLessonComplete(lesson, true);
        toast(`「${lesson.title}」练习全部答对，已标记完成`);
      }
    }
  } else {
    ui.lessonResults[questionId] = false;
    if (question.type === 'choice') {
      container.querySelectorAll('.option-button').forEach((button) => {
        if (button.dataset.value === value) {
          button.classList.add('wrong');
          button.disabled = true;
        }
      });
    }
    feedback.hidden = false;
    feedback.className = 'question-feedback no';
    feedback.innerHTML = '<strong>再想一想</strong>这个答案还不对，可以再试一次。';
  }
}

const QUIZ_MODES = [
  {
    id: 'kana',
    icon: 'あ',
    title: '五十音挑战',
    desc: '看假名选读音，也会反过来考平假名与片假名。',
  },
  {
    id: 'words',
    icon: '語',
    title: '词汇测验',
    desc: `日语与中文释义双向选择，覆盖 ${WORD_TOTAL} 个基础词。`,
  },
  {
    id: 'grammar',
    icon: '文',
    title: '语法练习',
    desc: `助词、句尾和形容词变化，来自 ${GRAMMAR_TOTAL} 个语法点。`,
  },
  {
    id: 'mixed',
    icon: '合',
    title: '综合挑战',
    desc: '假名、词汇、语法混合出题，检验综合掌握。',
  },
];

const QUIZ_LABELS = {
  kana: '五十音',
  words: '词汇',
  grammar: '语法',
  mixed: '综合',
  review: '错题复习',
  spaced: '间隔复习',
  'stage-test': '阶段测试',
};

function shuffle(list) {
  const array = [...list];
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [array[index], array[swap]] = [array[swap], array[index]];
  }
  return array;
}

function pick(list, count) {
  return shuffle(list).slice(0, Math.min(count, list.length));
}

function uniqueOptions(answer, pool, count = 4) {
  const options = [answer];
  for (const item of shuffle(pool)) {
    if (options.length >= count) break;
    if (!options.includes(item)) options.push(item);
  }
  return shuffle(options);
}

function buildKanaQuestions(count, sourcePool = null) {
  const romajiCounts = new Map();
  KANA_CELLS.forEach((cell) => {
    romajiCounts.set(cell.romaji, (romajiCounts.get(cell.romaji) || 0) + 1);
  });
  const reversePool = KANA_CELLS.filter((cell) => romajiCounts.get(cell.romaji) === 1);
  const selected = sourcePool
    ? uniqueContentPool(sourcePool).slice(0, Math.max(1, count))
    : pick(KANA_CELLS, count);
  return selected.map((cell, index) => {
    const reverse = index % 4 === 3 && reversePool.includes(cell);
    if (reverse) {
      return {
        id: `kana-${index}`,
        type: 'choice',
        prompt: `读音「${cell.romaji}」对应哪个假名？`,
        hint: '选择平假名',
        options: uniqueOptions(
          cell.hira,
          reversePool.filter((item) => item.hira !== cell.hira).map((item) => item.hira),
        ),
        answer: cell.hira,
        explanation: `「${cell.hira}」读作 ${cell.romaji}，片假名写作「${cell.kata}」。`,
        knowledgeType: 'kana',
        knowledgeId: cell.id,
        knowledgeLabel: `${cell.hira}（${cell.romaji}）`,
      };
    }
    return {
      id: `kana-${index}`,
      type: 'choice',
      prompt: `「${cell.hira}」怎么读？`,
      hint: `片假名：${cell.kata}`,
      options: uniqueOptions(cell.romaji, KANA_CELLS.map((item) => item.romaji)),
      answer: cell.romaji,
      explanation: `「${cell.hira}」读作 ${cell.romaji}，对应片假名「${cell.kata}」。`,
      knowledgeType: 'kana',
      knowledgeId: cell.id,
      knowledgeLabel: `${cell.hira}（${cell.romaji}）`,
    };
  });
}

function uniqueContentPool(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function prioritizedWordQuestionPool(metrics = studyPlanMetrics()) {
  if (!metrics) return CONTENT_WORDS;
  const focusUnmastered = metrics.focusWordPool.filter(
    (word) => !state.words[word.id],
  );
  const dueWordIds = new Set(
    collectReviewItems(metrics, { dueOnly: true })
      .filter((item) => item.type === 'word')
      .map((item) => item.id),
  );
  const dueWords = metrics.wordPool.filter((word) => dueWordIds.has(word.id));
  const planUnmastered = metrics.wordPool.filter(
    (word) => !state.words[word.id],
  );
  const prioritized = uniqueContentPool([
    ...focusUnmastered,
    ...dueWords,
    ...planUnmastered,
  ]);
  return prioritized.length ? prioritized : metrics.wordPool;
}

function buildWordQuestions(count, sourcePool = null) {
  const metrics = studyPlanMetrics();
  const primary = uniqueContentPool(
    sourcePool && sourcePool.length
      ? sourcePool
      : prioritizedWordQuestionPool(metrics),
  );
  const fallback = uniqueContentPool([
    ...primary,
    ...(metrics?.wordPool || []),
    ...CONTENT_WORDS,
  ]);
  const selected = fallback.slice(0, Math.max(1, count));
  return shuffle(selected).map((word, index) => {
    if (index % 4 === 3) {
      return {
        id: `word-${index}`,
        type: 'choice',
        prompt: `「${word.meaning}」对应的日语是？`,
        hint: '选择日语单词',
        options: uniqueOptions(
          word.word,
          CONTENT_WORDS.filter(
            (item) =>
              item.id !== word.id && item.meaning !== word.meaning,
          ).map((item) => item.word),
        ),
        answer: word.word,
        explanation: `${word.word}（${word.kana}）意思是「${word.meaning}」。`,
        knowledgeType: 'word',
        knowledgeId: word.id,
        knowledgeLabel: `${word.word}（${word.kana}）`,
      };
    }
    return {
      id: `word-${index}`,
      type: 'choice',
      prompt: `「${word.word}」是什么意思？`,
      hint: `读音：${word.kana}`,
      options: uniqueOptions(
        word.meaning,
        CONTENT_WORDS.filter((item) => item.id !== word.id).map((item) => item.meaning),
      ),
      answer: word.meaning,
      explanation: `${word.word}（${word.kana}）意思是「${word.meaning}」。例句：${word.examples[0]?.ja || ''}`,
      knowledgeType: 'word',
      knowledgeId: word.id,
      knowledgeLabel: `${word.word}（${word.kana}）`,
    };
  });
}

function grammarQuestionLevel(question) {
  return CONTENT_GRAMMAR_BY_ID[question.lessonId]?.level || '待核验';
}

function grammarPlanContext() {
  const metrics = studyPlanMetrics();
  if (!metrics) return null;
  const levelUnfinished = metrics.levels.find((level) =>
    metrics.grammarPool.some(
      (lesson) =>
        lesson.level === level && !state.grammar[lesson.id],
    ),
  );
  return {
    metrics,
    primaryLevel:
      levelUnfinished || metrics.levels[metrics.levels.length - 1] || '',
    reviewLevel:
      STUDY_TARGET_LEVELS.includes(metrics.plan.currentLevel) &&
      metrics.plan.currentLevel !== metrics.plan.targetLevel
        ? metrics.plan.currentLevel
        : '',
  };
}

function nextPlannedGrammarLesson() {
  const firstUnfinished = (lessons) =>
    lessons.find((lesson) => !state.grammar[lesson.id]) || null;
  const metrics = studyPlanMetrics();
  if (!metrics) {
    return firstUnfinished(CONTENT_GRAMMAR) ?? CONTENT_GRAMMAR[0] ?? null;
  }

  const plannedLessons = metrics.levels.flatMap((level) =>
    CONTENT_GRAMMAR.filter((lesson) => lesson.level === level),
  );
  const nextPlanned = firstUnfinished(plannedLessons);
  if (nextPlanned) return nextPlanned;

  const reviewLessons =
    STUDY_TARGET_LEVELS.includes(metrics.plan.currentLevel) &&
    metrics.plan.currentLevel !== metrics.plan.targetLevel
      ? CONTENT_GRAMMAR.filter(
          (lesson) => lesson.level === metrics.plan.currentLevel,
        )
      : [];
  const nextReview = firstUnfinished(reviewLessons);
  if (nextReview) return nextReview;

  return (
    firstUnfinished(CONTENT_GRAMMAR) ??
    plannedLessons[0] ??
    CONTENT_GRAMMAR[0] ??
    null
  );
}

function prioritizedGrammarQuestions(items) {
  const now = Date.now();
  const unmastered = [];
  const due = [];
  const rest = [];
  for (const question of items) {
    if (!state.grammar[question.lessonId]) {
      unmastered.push(question);
      continue;
    }
    const entry = effectiveReviewEntry('grammar', question.lessonId);
    if (entry && entry.nextReviewAt <= now) due.push(question);
    else rest.push(question);
  }
  return [...shuffle(unmastered), ...shuffle(due), ...shuffle(rest)];
}

function selectGrammarQuestions(count, scope = ui.grammarQuizScope) {
  const context = grammarPlanContext();
  if (scope === 'all' || !context) {
    return prioritizedGrammarQuestions(CONTENT_GRAMMAR_QUESTIONS).slice(
      0,
      count,
    );
  }
  const { metrics, primaryLevel, reviewLevel } = context;
  const targetLevels = new Set(metrics.levels);
  const byLevel = (level) =>
    CONTENT_GRAMMAR_QUESTIONS.filter(
      (question) => grammarQuestionLevel(question) === level,
    );
  const selected = [];
  const selectedIds = new Set();
  const selectedKnowledge = new Set();
  const take = (pool, quota) => {
    const available = prioritizedGrammarQuestions(
      pool.filter(
        (question) =>
          !selectedIds.has(question.id) &&
          !selectedKnowledge.has(question.lessonId),
      ),
    );
    const picked = shuffle(available.slice(0, Math.max(0, quota)));
    for (const question of picked) {
      selected.push(question);
      selectedIds.add(question.id);
      selectedKnowledge.add(question.lessonId);
    }
  };
  const primary = byLevel(primaryLevel);
  const later = CONTENT_GRAMMAR_QUESTIONS.filter(
    (question) =>
      targetLevels.has(grammarQuestionLevel(question)) &&
      grammarQuestionLevel(question) !== primaryLevel,
  );
  const review = reviewLevel ? byLevel(reviewLevel) : [];
  const primaryQuota = Math.max(1, Math.round(count * 0.7));
  const reviewQuota = review.length
    ? count >= 5
      ? Math.max(1, Math.round(count * 0.1))
      : 1
    : 0;
  const laterQuota = Math.max(0, count - primaryQuota - reviewQuota);
  take(primary, primaryQuota);
  take(later, laterQuota);
  take(review, reviewQuota);
  take(
    CONTENT_GRAMMAR_QUESTIONS.filter((question) =>
      targetLevels.has(grammarQuestionLevel(question)),
    ),
    count - selected.length,
  );
  take(CONTENT_GRAMMAR_QUESTIONS, count - selected.length);
  return selected.slice(0, count);
}

function grammarQuizScopeInfo() {
  const context = grammarPlanContext();
  if (!context || ui.grammarQuizScope === 'all') {
    return {
      label: '全部等级',
      detail: '从现有全部语法练习题中随机抽取。',
    };
  }
  return {
    label: '按当前学习计划',
    detail: `${context.metrics.levels.join('、')} · 主练 ${context.primaryLevel}${
      context.reviewLevel ? ` · 复习 ${context.reviewLevel}` : ''
    }`,
  };
}

function grammarQuestionToQuizQuestion(question, index, prefix = 'grammar') {
  return (
    question.type === 'choice'
      ? {
          id: `${prefix}-${index}`,
          type: 'choice',
          prompt: question.prompt,
          hint: `语法：${question.lessonTitle}`,
          options: uniqueOptions(
            question.answer,
            question.options.filter((option) => option !== question.answer),
          ),
          answer: question.answer,
          explanation: question.explanation,
          knowledgeType: 'grammar',
          knowledgeId: question.lessonId,
          knowledgeLabel: question.lessonTitle,
        }
      : {
          id: `${prefix}-${index}`,
          type: 'fill',
          prompt: question.prompt,
          hint: `语法：${question.lessonTitle}`,
          answers: question.answers,
          explanation: question.explanation,
          knowledgeType: 'grammar',
          knowledgeId: question.lessonId,
          knowledgeLabel: question.lessonTitle,
        }
  );
}

function buildGrammarQuestions(count, scope = ui.grammarQuizScope) {
  return selectGrammarQuestions(count, scope).map((question, index) =>
    grammarQuestionToQuizQuestion(question, index),
  );
}

function knowledgeQuestionKey(item) {
  return [
    item?.knowledgeType || '',
    item?.knowledgeId || '',
    item?.correct || '',
    item?.prompt || '',
  ].join('|');
}

function storedWrongQuestions() {
  const active = new Map();
  const chronological = [...(state.quizzes || [])].reverse();
  for (const quiz of chronological) {
    for (const item of quiz.correctKnowledge || []) {
      active.delete(knowledgeQuestionKey(item));
    }
    for (const item of quiz.wrongQuestions || []) {
      active.set(knowledgeQuestionKey(item), item);
    }
  }
  return [...active.values()];
}

function buildWrongReviewQuestions(count = QUESTIONS_PER_QUIZ) {
  return storedWrongQuestions()
    .slice(0, count)
    .map((item, index) => {
      const base = {
        id: `review-${index}`,
        type: item.type === 'fill' ? 'fill' : 'choice',
        prompt: String(item.prompt || ''),
        hint: String(item.hint || '错题复习'),
        explanation: String(item.explanation || '暂无解析'),
        knowledgeType: item.knowledgeType || '',
        knowledgeId: item.knowledgeId || '',
        knowledgeLabel: item.knowledgeLabel || '',
      };
      if (base.type === 'choice') {
        return {
          ...base,
          options: Array.isArray(item.options) ? [...item.options] : [],
          answer: String(item.correct || ''),
        };
      }
      return {
        ...base,
        answers: Array.isArray(item.answers)
          ? [...item.answers]
          : [String(item.correct || '')],
      };
    })
    .filter((question) =>
      question.type === 'choice'
        ? question.options.length >= 2 && question.answer
        : question.answers.length > 0,
    );
}

function uniqueKnowledgeQuestions(items) {
  const seen = new Set();
  return items.filter((question) => {
    const key = question.knowledgeType && question.knowledgeId
      ? reviewEntryKey(question.knowledgeType, question.knowledgeId)
      : `${question.id}:${question.prompt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSpacedReviewQuestions(
  count = QUESTIONS_PER_QUIZ,
  metrics = studyPlanMetrics(),
) {
  const due = collectReviewItems(metrics, { dueOnly: true }).slice(0, count);
  if (!due.length) return [];
  const kanaIds = due.filter((item) => item.type === 'kana').map((item) => item.id);
  const wordIds = due.filter((item) => item.type === 'word').map((item) => item.id);
  const grammarIds = new Set(
    due.filter((item) => item.type === 'grammar').map((item) => item.id),
  );
  const kanaPool = kanaIds
    .map((id) => KANA_BY_ID[id])
    .filter(Boolean);
  const wordPool = wordIds
    .map((id) => CONTENT_WORD_BY_ID[id])
    .filter(Boolean);
  const grammarPool = prioritizedGrammarQuestions(
    CONTENT_GRAMMAR_QUESTIONS.filter((question) =>
      grammarIds.has(question.lessonId),
    ),
  ).slice(0, grammarIds.size);
  return uniqueKnowledgeQuestions([
    ...(kanaPool.length
      ? buildKanaQuestions(kanaPool.length, kanaPool)
      : []),
    ...(wordPool.length
      ? buildWordQuestions(wordPool.length, wordPool)
      : []),
    ...grammarPool.map((question, index) =>
      grammarQuestionToQuizQuestion(question, index, 'spaced-grammar'),
    ),
  ]).slice(0, count);
}

function buildStageTestQuestions(
  count = QUESTIONS_PER_QUIZ,
  metrics = studyPlanMetrics(),
) {
  if (!metrics) return buildWrongReviewQuestions(count);
  if (metrics.stage.id === 'kana-foundation') {
    const dueIds = new Set(
      collectReviewItems(metrics, { dueOnly: true })
        .filter((item) => item.type === 'kana')
        .map((item) => item.id),
    );
    const unmastered = KANA_CELLS.filter((cell) => !state.kana[cell.id]);
    const due = KANA_CELLS.filter((cell) => dueIds.has(cell.id));
    const pool = uniqueContentPool([
      ...unmastered,
      ...due,
      ...KANA_CELLS,
    ]);
    return buildKanaQuestions(Math.min(count, pool.length), pool);
  }

  const level = metrics.focusLevel;
  const due = collectReviewItems(metrics, { dueOnly: true });
  const dueWordIds = new Set(
    due.filter((item) => item.type === 'word').map((item) => item.id),
  );
  const freshWords = metrics.focusWordPool.filter(
    (word) => !state.words[word.id],
  );
  const dueWords = metrics.focusWordPool.filter((word) =>
    dueWordIds.has(word.id),
  );
  const wordPool = uniqueContentPool([
    ...freshWords,
    ...dueWords,
    ...metrics.focusWordPool,
  ]);
  const grammarPool = prioritizedGrammarQuestions(
    CONTENT_GRAMMAR_QUESTIONS.filter(
      (question) => grammarQuestionLevel(question) === level,
    ),
  );
  const wordCount = Math.max(1, Math.round(count * 0.6));
  const grammarCount = Math.max(0, count - wordCount);
  const questions = uniqueKnowledgeQuestions([
    ...buildWordQuestions(
      Math.min(wordCount, wordPool.length),
      wordPool,
    ),
    ...grammarPool
      .slice(0, grammarCount)
      .map((question, index) =>
        grammarQuestionToQuizQuestion(question, index, 'stage-grammar'),
      ),
  ]);
  if (questions.length < count) {
    const extraWords = buildWordQuestions(
      count - questions.length,
      metrics.focusWordPool,
    );
    return uniqueKnowledgeQuestions([...questions, ...extraWords]).slice(
      0,
      count,
    );
  }
  return questions.slice(0, count);
}

function buildQuiz(mode, questionCount = QUESTIONS_PER_QUIZ) {
  const count = Math.max(
    1,
    Math.min(
      MAX_PRACTICE_QUESTION_COUNT,
      Number(questionCount) || QUESTIONS_PER_QUIZ,
    ),
  );
  let questions;
  const metrics = studyPlanMetrics();
  if (mode === 'kana') questions = buildKanaQuestions(count);
  else if (mode === 'words') questions = buildWordQuestions(count);
  else if (mode === 'grammar') questions = buildGrammarQuestions(count);
  else if (mode === 'review') questions = buildWrongReviewQuestions(count);
  else if (mode === 'spaced') questions = buildSpacedReviewQuestions(count, metrics);
  else if (mode === 'stage-test') questions = buildStageTestQuestions(count, metrics);
  else {
    if (metrics && metrics.stage.id !== 'kana-foundation') {
      const grammarCount = Math.max(1, Math.round(count * 0.3));
      const wordCount = Math.max(1, count - grammarCount);
      questions = shuffle([
        ...buildWordQuestions(wordCount),
        ...buildGrammarQuestions(grammarCount),
      ]);
    } else {
      const kanaCount = Math.max(1, Math.round(count * 0.4));
      const wordCount = Math.max(1, Math.round(count * 0.3));
      const grammarCount = Math.max(1, count - kanaCount - wordCount);
      questions = shuffle([
        ...buildKanaQuestions(kanaCount),
        ...buildWordQuestions(wordCount),
        ...buildGrammarQuestions(grammarCount),
      ]);
    }
  }
  return {
    mode,
    stageLevel:
      mode === 'stage-test' || mode === 'spaced'
        ? metrics?.stage.id === 'kana-foundation'
          ? 'kana'
          : metrics?.focusLevel || ''
        : '',
    taskKind: mode,
    questions,
    questionCount: questions.length,
    index: 0,
    correct: 0,
    answeredCount: 0,
    answered: false,
    selected: null,
    isCorrect: null,
    wrong: [],
    finished: false,
  };
}

function renderQuiz() {
  if (!ui.quiz) {
    const hasPlan = Boolean(grammarPlanContext());
    const scopeInfo = grammarQuizScopeInfo();
    const wrongItems = storedWrongQuestions();
    const planMetrics = studyPlanMetrics();
    const dueReviewCount = collectReviewItems(planMetrics, {
      dueOnly: true,
    }).length;
    const stageTest = stageTestStatus(planMetrics);
    const rounds = practiceRoundPlan();
    const nextRound = nextPracticeRound(rounds);
    const dailyPracticeTarget = rounds.length;
    const practiceQuestionTarget = rounds[0]?.count || 6;
    const todayPracticeCount = practiceCountForDate(todayKey());
    const todayAnsweredCount = practiceQuestionCountForDate(todayKey());
    const quizAnswered = state.quizzes.reduce(
      (total, quiz) => total + Number(quiz.total || 0),
      0,
    );
    const quizCorrect = state.quizzes.reduce(
      (total, quiz) => total + Number(quiz.score || 0),
      0,
    );
    const quizRate = quizAnswered
      ? Math.round((quizCorrect / quizAnswered) * 100)
      : 0;
    return `
      <div class="page">
        <section class="quiz-dashboard-hero">
          <div>
            <span class="quiz-dashboard-kicker">PRACTICE ARENA</span>
            <h2>把练习变成知识回顾</h2>
            <p>答题后会显示答案、解析和关联知识点；错误题目会进入可持久保存的错题复习队列。</p>
          </div>
          <div class="quiz-dashboard-stats">
            <span><strong>${state.quizzes.length}</strong>组练习</span>
            <span><strong>${quizAnswered}</strong>道已答</span>
            <span><strong>${quizRate}%</strong>正确率</span>
            <span><strong>${wrongItems.length}</strong>个待复习</span>
          </div>
        </section>
        <section class="panel practice-preferences-panel">
          <div class="practice-preferences-copy">
            <div>
              <h3 class="panel-title">每日练习目标</h3>
              <p class="panel-note">按自己的节奏设置轮数；今日已完成 ${Math.min(todayPracticeCount, dailyPracticeTarget)}/${dailyPracticeTarget} 轮，共答 ${todayAnsweredCount} 题。</p>
            </div>
            <span class="practice-target-progress">${todayPracticeCount}/${dailyPracticeTarget}</span>
          </div>
          <div class="practice-preferences-controls">
            <label>每天练习轮数
              <select id="practice-daily-groups">
                <option value="0"${normalizePracticeGroupCount(state.studyPlan.dailyPracticeGroups) ? '' : ' selected'}>自动（${dailyPracticeTarget} 轮）</option>
                ${PRACTICE_GROUP_OPTIONS.map(
                  (count) =>
                    `<option value="${count}"${normalizePracticeGroupCount(state.studyPlan.dailyPracticeGroups) === count ? ' selected' : ''}>${count} 轮</option>`,
                ).join('')}
              </select>
            </label>
            <label>每轮题数
              <select id="practice-question-count">
                <option value="0"${normalizePracticeQuestionCount(state.studyPlan.practiceQuestionsPerRound) ? '' : ' selected'}>自动（${practiceQuestionTarget} 题）</option>
                ${PRACTICE_QUESTION_OPTIONS.map(
                  (count) =>
                    `<option value="${count}"${normalizePracticeQuestionCount(state.studyPlan.practiceQuestionsPerRound) === count ? ' selected' : ''}>${count} 题</option>`,
                ).join('')}
              </select>
            </label>
          </div>
        </section>
        <section class="panel quiz-scope-panel">
          <div>
            <strong>语法检测抽题范围</strong>
            <p>${esc(scopeInfo.detail)}</p>
          </div>
          <div class="segmented" role="group" aria-label="语法检测抽题范围">
            <button class="segment-button${ui.grammarQuizScope === 'plan' ? ' active' : ''}" type="button"
              data-action="quiz-grammar-scope" data-scope="plan"
              ${hasPlan ? '' : 'disabled'}>按学习计划</button>
            <button class="segment-button${ui.grammarQuizScope === 'all' ? ' active' : ''}" type="button"
              data-action="quiz-grammar-scope" data-scope="all">全部等级</button>
          </div>
        </section>
        <section class="panel practice-rounds-panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">今日多轮练习</h3>
              <p class="panel-note">每组控制在 ${rounds[0]?.count || 6} 题，分成多轮提取记忆；答对后的错题会从错题本移除。</p>
            </div>
            <button class="primary-button" type="button" data-action="quiz-round-next">
              开始${nextRound.title.replace(/^第 \d+ 轮 · /, '')}
            </button>
          </div>
          <div class="practice-round-list">
            ${rounds
              .map(
                (round) => `
                <button class="practice-round-card${round.completed ? ' completed' : ''}"
                  type="button" data-action="quiz-start" data-mode="${round.mode}"
                  data-count="${round.count}">
                  <span class="practice-round-number">${round.completed ? '✓' : round.index + 1}</span>
                  <span class="practice-round-copy">
                    <strong>${esc(round.title)}</strong>
                    <small>${esc(round.detail)}</small>
                  </span>
                  <span class="practice-round-meta">${round.count} 题 · ${round.minutes} 分钟</span>
                </button>`,
              )
              .join('')}
          </div>
        </section>
        ${
          hasPlan
            ? `<section class="panel">
                <div class="panel-head">
                  <div>
                    <h3 class="panel-title">自适应复习与阶段检查</h3>
                    <p class="panel-note">复习题来自已掌握内容；阶段测试只使用当前等级已有的词汇和语法题。</p>
                  </div>
                </div>
                <div class="study-plan-actions">
                  <button class="secondary-button" type="button" data-action="quiz-start"
                    data-mode="spaced" data-count="${Math.min(10, Math.max(1, dueReviewCount))}"
                    ${dueReviewCount ? '' : 'disabled'}>
                    间隔复习 ${dueReviewCount} 题
                  </button>
                  <button class="primary-button" type="button" data-action="quiz-start"
                    data-mode="stage-test"
                    data-count="${Math.min(15, Math.max(10, practiceQuestionTarget))}">
                    ${stageTest?.latestRate === null || stageTest?.latestRate === undefined
                      ? '开始阶段测试'
                      : `阶段测试 · 上次 ${Math.round(stageTest.latestRate * 100)}%`}
                  </button>
                </div>
              </section>`
            : ''
        }
        <div class="mode-grid">
          ${QUIZ_MODES.map(
            (mode) => `
            <button class="mode-card" type="button" data-action="quiz-start" data-mode="${mode.id}"
              data-count="${practiceQuestionTarget}">
              <span class="mode-icon" aria-hidden="true">${mode.icon}</span>
              <h3>${mode.title}</h3>
              <p>${mode.desc}</p>
              <p class="module-meta" style="margin-top:8px">${practiceQuestionTarget} 题 · 约 ${Math.max(2, Math.round(practiceQuestionTarget * 0.3))} 分钟</p>
            </button>`,
          ).join('')}
        </div>
        <section class="panel quiz-review-panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">错题复习</h3>
              <p class="panel-note">根据真实错误自动整理；同一知识点复习答对后会移出错题本，未答对则继续保留。</p>
            </div>
            ${
              wrongItems.length
                ? `<button class="primary-button" type="button" data-action="quiz-start" data-mode="review"
                    data-count="${Math.min(practiceQuestionTarget, wrongItems.length)}">复习 ${Math.min(practiceQuestionTarget, wrongItems.length)} 题</button>`
                : ''
            }
          </div>
          ${
            wrongItems.length
              ? `<div class="quiz-review-points">
                  ${wrongItems
                    .slice(0, 8)
                    .map(
                      (item) =>
                        ['word', 'grammar'].includes(item.knowledgeType)
                          ? `
                    <button type="button"
                      data-action="translation-knowledge"
                      data-knowledge-type="${esc(item.knowledgeType || '')}"
                      data-knowledge-id="${esc(item.knowledgeId || '')}"
                      data-match-text="${esc(item.knowledgeLabel || item.prompt || '')}">
                      <strong>${esc(item.knowledgeLabel || item.prompt)}</strong>
                      <span>${esc(item.correct || '')}</span>
                    </button>`
                          : `
                    <span class="quiz-review-static">
                      <strong>${esc(item.knowledgeLabel || item.prompt)}</strong>
                      <span>${esc(item.correct || '')}</span>
                    </span>`,
                    )
                    .join('')}
                </div>`
              : '<div class="quiz-review-empty">目前没有待复习错题。完成练习后，错误知识点会自动保存在这里。</div>'
          }
        </section>
        <section class="panel" style="margin-top:16px">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">最近测验</h3>
              <p class="panel-note">每组 ${practiceQuestionTarget} 题，成绩会保存在本地</p>
            </div>
          </div>
          ${
            state.quizzes.length
              ? `<div class="recent-list">
                  ${state.quizzes
                    .slice(0, 5)
                    .map(
                      (quiz) => `
                    <div class="recent-item">
                      <span class="recent-dot"></span>
                      <div class="recent-copy">
                        <div class="recent-title">${QUIZ_LABELS[quiz.mode] ?? '练习'}测验 · ${quiz.score}/${quiz.total}</div>
                        <div class="recent-time">
                          ${relativeTime(quiz.at)} · 错 ${Array.isArray(quiz.wrongQuestions) ? quiz.wrongQuestions.length : Math.max(0, Number(quiz.total || 0) - Number(quiz.score || 0))} 题
                        </div>
                      </div>
                    </div>`,
                    )
                    .join('')}
                </div>`
              : `<div class="empty"><div class="empty-mark">試</div>还没有测验记录，选一个模式开始。</div>`
          }
        </section>
      </div>`;
  }
  if (ui.quiz.finished) return renderQuizResult();
  return renderQuizQuestion();
}

function renderQuizQuestion() {
  const quiz = ui.quiz;
  const question = quiz.questions[quiz.index];
  const total = quiz.questions.length;
  const progress = Math.round(((quiz.index + (quiz.answered ? 1 : 0)) / total) * 100);
  const correctText =
    question.type === 'choice'
      ? question.answer
      : (question.answers || []).join(' / ');

  return `
    <div class="page">
      <div class="quiz-shell">
        <div class="quiz-head">
          <span>${QUIZ_LABELS[quiz.mode] ?? ''}测验 · 第 ${quiz.index + 1} / ${total} 题</span>
          <span>已答对 ${quiz.correct}</span>
        </div>
        <div class="quiz-progress"><div style="width:${progress}%"></div></div>
        <div class="question-text">${esc(question.prompt)}</div>
        ${question.hint ? `<div class="question-hint">${esc(question.hint)}</div>` : ''}

        ${
          question.type === 'choice'
            ? `<div class="options">
                ${question.options
                  .map((option, index) => {
                    const chosen = quiz.selected === option;
                    let extra = '';
                    if (quiz.answered) {
                      if (option === question.answer) extra = ' correct';
                      else if (chosen) extra = ' wrong';
                    }
                    return `
                    <button class="option-button${extra}" type="button"
                      data-action="quiz-answer" data-value="${esc(option)}"
                      ${quiz.answered ? 'disabled' : ''}>
                      <span style="color:var(--muted-2);margin-right:8px">${String.fromCharCode(65 + index)}</span>${esc(option)}
                    </button>`;
                  })
                  .join('')}
              </div>`
            : `<div class="fill-row">
                <input class="answer-input" id="quiz-fill" type="text" autocomplete="off"
                  placeholder="输入答案后按回车" aria-label="填写答案"
                  value="${quiz.answered ? esc(quiz.selected ?? '') : ''}" ${quiz.answered ? 'disabled' : ''} />
                <button class="primary-button" type="button" data-action="quiz-submit-fill"
                  ${quiz.answered ? 'disabled' : ''}>提交</button>
              </div>`
        }

        ${
          quiz.answered
            ? `<div class="quiz-answer-card ${quiz.isCorrect ? 'correct' : 'wrong'}">
                <div class="quiz-answer-head">
                  <strong>${quiz.isCorrect ? '回答正确' : '回答错误，看看知识点'}</strong>
                  <span>${quiz.isCorrect ? '继续保持' : '错题会自动加入复习'}</span>
                </div>
                <div class="quiz-answer-grid">
                  <span><small>你的答案</small>${esc(quiz.selected || '未作答')}</span>
                  <span><small>正确答案</small>${esc(correctText)}</span>
                </div>
                <p>${esc(question.explanation)}</p>
                ${
                  ['word', 'grammar'].includes(question.knowledgeType)
                    ? `<button class="small-button" type="button"
                        data-action="translation-knowledge"
                        data-knowledge-type="${esc(question.knowledgeType)}"
                        data-knowledge-id="${esc(question.knowledgeId)}"
                        data-match-text="${esc(question.knowledgeLabel || '')}">
                        查看${question.knowledgeType === 'word' ? '词汇' : '语法'}知识点
                      </button>`
                    : ''
                }
              </div>`
            : ''
        }

        <div class="quiz-actions">
          <button class="ghost-button" type="button" data-action="quiz-exit">退出测验</button>
          <button class="primary-button" type="button" data-action="quiz-next" ${quiz.answered ? '' : 'disabled'}>
            ${quiz.index + 1 >= total ? '查看结果' : '下一题'}
          </button>
        </div>
      </div>
    </div>`;
}

function renderQuizResult() {
  const quiz = ui.quiz;
  const total = quiz.questions.length;
  const durationSeconds =
    quiz.startedAt && quiz.completedAt
      ? Math.max(
          1,
          Math.round((Number(quiz.completedAt) - Number(quiz.startedAt)) / 1000),
        )
      : 0;
  const percent = total ? Math.round((quiz.correct / total) * 100) : 0;
  const wrong = quiz.wrong.length;
  const nextRound = nextPracticeRound();
  const knowledgePoints = [
    ...new Map(
      quiz.wrong
        .filter((item) => item.knowledgeLabel)
        .map((item) => [
          `${item.knowledgeType}:${item.knowledgeId}`,
          item,
        ]),
    ).values(),
  ];
  const summary =
    percent === 100
      ? '全部正确，这一组非常稳。'
      : percent >= 80
        ? '掌握得不错，保持这个节奏。'
        : percent >= 60
          ? '基础已经有了，错题再看一遍会更牢。'
          : '先把错题过一遍，再来一组会更有效。';

  return `
    <div class="page">
      <div class="quiz-shell">
        <div class="quiz-result">
          <div class="score-big">${quiz.correct}<span> / ${total}</span></div>
          <p class="result-text">${summary}</p>
        </div>
        <div class="quiz-result-stats">
          <div><strong>${total}</strong><span>答题数量</span></div>
          <div><strong>${percent}%</strong><span>正确率</span></div>
          <div><strong>${wrong}</strong><span>错题数量</span></div>
          <div><strong>${knowledgePoints.length}</strong><span>需复习知识点</span></div>
        </div>
        <p class="quiz-session-meta">
          本次实际作答 ${quiz.answeredCount}/${total} 题
          ${durationSeconds ? ` · 用时 ${Math.floor(durationSeconds / 60)}分${durationSeconds % 60}秒` : ''}
          · 已写入练习记录
        </p>
        ${
          knowledgePoints.length
            ? `<div class="lesson-section quiz-result-knowledge">
                <h3>需要复习的知识点</h3>
                <div class="quiz-review-points">
                  ${knowledgePoints
                    .map(
                      (item) =>
                        ['word', 'grammar'].includes(item.knowledgeType)
                          ? `
                    <button type="button"
                      data-action="translation-knowledge"
                      data-knowledge-type="${esc(item.knowledgeType)}"
                      data-knowledge-id="${esc(item.knowledgeId)}"
                      data-match-text="${esc(item.knowledgeLabel)}">
                      <strong>${esc(item.knowledgeLabel)}</strong>
                      <span>${esc(item.correct)}</span>
                    </button>`
                          : `
                    <span class="quiz-review-static">
                      <strong>${esc(item.knowledgeLabel || item.prompt)}</strong>
                      <span>${esc(item.correct)}</span>
                    </span>`,
                    )
                    .join('')}
                </div>
              </div>`
            : ''
        }
        ${
          wrong
            ? `<div class="lesson-section">
                <h3>错题回顾</h3>
                <div class="quiz-wrong-list">
                  ${quiz.wrong
                    .map(
                      (item) => `
                    <div class="quiz-wrong-card">
                      <div class="quiz-wrong-prompt">${esc(item.prompt)}</div>
                      <div class="quiz-wrong-answer">
                        <span>你的答案：${esc(item.your)}</span>
                        <span>正确答案：${esc(item.correct)}</span>
                      </div>
                      <p>${esc(item.explanation)}</p>
                      ${
                        ['word', 'grammar'].includes(item.knowledgeType)
                          ? `<button class="small-button" type="button"
                              data-action="translation-knowledge"
                              data-knowledge-type="${esc(item.knowledgeType)}"
                              data-knowledge-id="${esc(item.knowledgeId)}"
                              data-match-text="${esc(item.knowledgeLabel || '')}">
                              查看关联知识点
                            </button>`
                          : ''
                      }
                    </div>`,
                    )
                    .join('')}
                </div>
              </div>`
            : ''
        }
        <div class="quiz-actions">
          <button class="secondary-button" type="button" data-action="quiz-exit">返回测验</button>
          ${
            wrong
              ? `<button class="secondary-button" type="button" data-action="quiz-start" data-mode="review">复习错题</button>`
              : ''
          }
          <button class="secondary-button" type="button" data-action="quiz-restart"
            data-mode="${quiz.mode}" data-count="${total}">
            同类再练
          </button>
          <button class="primary-button" type="button" data-action="quiz-round-next">
            ${nextRound.completed ? '加练一轮' : `下一轮：${esc(nextRound.title.replace(/^第 \d+ 轮 · /, ''))}`}
          </button>
        </div>
      </div>
    </div>`;
}

function submitQuizAnswer(rawValue) {
  const quiz = ui.quiz;
  if (!quiz || quiz.answered) return;
  const question = quiz.questions[quiz.index];
  const value = String(rawValue ?? '').trim();
  if (!value) {
    toast('先填写一个答案');
    return;
  }
  const correct =
    question.type === 'choice'
      ? value === question.answer
      : (question.answers || []).some((answer) => normalizeAnswer(answer) === normalizeAnswer(value));

  quiz.answered = true;
  quiz.selected = value;
  quiz.isCorrect = correct;
  quiz.answeredCount += 1;
  updatePracticeSession(quiz.sessionId, {
    answeredCount: quiz.answeredCount,
    score: quiz.correct,
  });
  state.stats.answered += 1;
  if (correct) {
    quiz.correct += 1;
    state.stats.correct += 1;
  } else {
    quiz.wrong.push({
      type: question.type,
      hint: question.hint || '',
      prompt: question.prompt,
      options: Array.isArray(question.options) ? [...question.options] : [],
      answers: Array.isArray(question.answers) ? [...question.answers] : [],
      your: value,
      correct:
        question.type === 'choice' ? question.answer : (question.answers || []).join(' / '),
      explanation: question.explanation,
      knowledgeType: question.knowledgeType || '',
      knowledgeId: question.knowledgeId || '',
      knowledgeLabel: question.knowledgeLabel || '',
    });
  }
  scheduleSave();
  render(true);
}

function nextQuizQuestion() {
  const quiz = ui.quiz;
  if (!quiz || !quiz.answered) return;
  if (quiz.index + 1 >= quiz.questions.length) {
    finishQuiz();
    return;
  }
  quiz.index += 1;
  quiz.answered = false;
  quiz.selected = null;
  quiz.isCorrect = null;
  render();
}

function finishQuiz() {
  const quiz = ui.quiz;
  quiz.finished = true;
  const wrongKeys = new Set(quiz.wrong.map(knowledgeQuestionKey));
  const correctKnowledge = [
    ...new Map(
      quiz.questions
        .map((question) => ({
          knowledgeType: question.knowledgeType || '',
          knowledgeId: question.knowledgeId || '',
          correct:
            question.type === 'choice'
              ? question.answer
              : (question.answers || []).join(' / '),
          prompt: question.prompt || '',
        }))
        .filter(
          (item) =>
            item.knowledgeId && !wrongKeys.has(knowledgeQuestionKey(item)),
        )
        .map((item) => [knowledgeQuestionKey(item), item]),
    ).values(),
  ];
  const completedAt = Date.now();
  quiz.completedAt = completedAt;
  completeCurrentPracticeSession(quiz, completedAt);
  applyQuizReviewOutcomes(quiz, completedAt);
  state.quizzes.unshift({
    sessionId: quiz.sessionId,
    mode: quiz.mode,
    stageLevel: quiz.stageLevel || '',
    taskKind: quiz.taskKind || '',
    score: quiz.correct,
    total: quiz.questions.length,
    plannedCount: quiz.questions.length,
    answeredCount: quiz.answeredCount,
    startedAt: quiz.startedAt,
    completedAt,
    at: completedAt,
    wrongQuestions: quiz.wrong.map((item) => ({ ...item })),
    correctKnowledge,
  });
  state.quizzes = state.quizzes.slice(0, 50);
  recordActivity(
    'quiz',
    `${QUIZ_LABELS[quiz.mode] ?? ''}测验 ${quiz.correct}/${quiz.questions.length}`,
  );
  scheduleSave();
  render();
  toast(`测验完成：${quiz.correct}/${quiz.questions.length}`);
}

function chooseLessonOption(button) {
  const container = button.closest('.question-inline');
  if (!container) return;
  const questionId = container.dataset.questionId;
  if (ui.lessonResults[questionId] === true) return;
  container
    .querySelectorAll('.option-button')
    .forEach((optionButton) => optionButton.classList.remove('selected'));
  button.classList.add('selected');
  ui.lessonAnswers[questionId] = button.dataset.value;
  checkLessonQuestion(questionId, container, button.dataset.value);
}

function toggleKana(kanaId) {
  const cell = KANA_CELLS.find((item) => item.id === kanaId);
  if (!cell) return;
  if (state.kana[kanaId]) {
    delete state.kana[kanaId];
    removeReviewScheduleItem('kana', kanaId);
    toast(`已取消「${cell.hira}」的掌握标记`);
  } else {
    state.kana[kanaId] = Date.now();
    scheduleInitialReview('kana', kanaId, state.kana[kanaId]);
    recordActivity('kana', `掌握假名「${cell.hira}」（${cell.romaji}）`);
    toast(`已掌握「${cell.hira}」`);
  }
  scheduleSave();
  render(true);
}

function toggleWord(wordId) {
  const word = CONTENT_WORD_BY_ID[wordId];
  if (!word) return;
  if (state.words[wordId]) {
    delete state.words[wordId];
    removeReviewScheduleItem('word', wordId);
    toast(`已取消「${word.word}」的掌握标记`);
  } else {
    state.words[wordId] = Date.now();
    scheduleInitialReview('word', wordId, state.words[wordId]);
    recordActivity('words', `掌握词汇「${word.word}」（${word.meaning}）`);
    toast(`已掌握「${word.word}」`);
  }
  scheduleSave();
  render(true);
}

function openLesson(lessonId) {
  const lesson = CONTENT_GRAMMAR_BY_ID[lessonId];
  if (!lesson) return;
  ui.lessonId = lessonId;
  lesson.exercises.forEach((question) => {
    delete ui.lessonResults[question.id];
    delete ui.lessonAnswers[question.id];
  });
  render();
}

function updatePracticeSession(sessionId, patch = {}) {
  if (!sessionId) return;
  const sessions = normalizePracticeSessions(state.practiceSessions);
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) return;
  Object.assign(session, patch);
  state.practiceSessions = normalizePracticeSessions(sessions);
}

function abandonInterruptedPracticeSessions() {
  let changed = false;
  const now = Date.now();
  const sessions = normalizePracticeSessions(state.practiceSessions).map(
    (session) => {
      if (session.status !== 'active') return session;
      changed = true;
      return {
        ...session,
        status: 'abandoned',
        endedAt: session.endedAt || now,
      };
    },
  );
  if (!changed) return;
  state.practiceSessions = normalizePracticeSessions(sessions);
  scheduleSave();
}

function beginPracticeSession(quiz) {
  const startedAt = Date.now();
  quiz.sessionId = `practice-${startedAt}-${Math.random().toString(36).slice(2, 8)}`;
  quiz.startedAt = startedAt;
  state.practiceSessions = normalizePracticeSessions([
    {
      id: quiz.sessionId,
      startedAt,
      at: startedAt,
      mode: quiz.mode,
      stageLevel: quiz.stageLevel || '',
      taskKind: quiz.taskKind || '',
      status: 'active',
      plannedCount: quiz.questions.length,
      answeredCount: 0,
      score: 0,
      questionIds: quiz.questions.map((question) => question.id),
      knowledgeIds: [
        ...new Set(
          quiz.questions
            .map((question) => question.knowledgeId)
            .filter(Boolean),
        ),
      ],
    },
    ...(state.practiceSessions || []),
  ]);
  scheduleSave();
}

function abandonCurrentPracticeSession(quiz = ui.quiz) {
  if (!quiz || !quiz.sessionId || quiz.finished) return;
  updatePracticeSession(quiz.sessionId, {
    status: 'abandoned',
    endedAt: Date.now(),
    answeredCount: Number(quiz.answeredCount) || 0,
    score: Number(quiz.correct) || 0,
  });
  scheduleSave();
}

function completeCurrentPracticeSession(quiz, completedAt) {
  updatePracticeSession(quiz.sessionId, {
    status: 'completed',
    endedAt: completedAt,
    completedAt,
    at: completedAt,
    answeredCount: Number(quiz.answeredCount) || 0,
    score: Number(quiz.correct) || 0,
  });
}

function startQuiz(mode, questionCount = QUESTIONS_PER_QUIZ) {
  if (mode === 'review' && !storedWrongQuestions().length) {
    toast('目前没有可复习的错题');
    return;
  }
  if (
    mode === 'spaced' &&
    !collectReviewItems(studyPlanMetrics(), { dueOnly: true }).length
  ) {
    toast('目前没有到期的间隔复习内容');
    return;
  }
  if (mode === 'stage-test' && !studyPlanMetrics()) {
    toast('请先制定学习计划再进行阶段测试');
    return;
  }
  ui.route = 'quiz';
  abandonCurrentPracticeSession();
  ui.quiz = buildQuiz(mode, questionCount);
  if (!ui.quiz.questions.length) {
    ui.quiz = null;
    toast('当前没有可用的测试内容');
    return;
  }
  beginPracticeSession(ui.quiz);
  render();
}

function exitQuiz() {
  abandonCurrentPracticeSession();
  ui.quiz = null;
  render();
}

function openModal(html) {
  if (courseBrowserAttached) {
    courseBrowserAttached = false;
    bridge.hideCourseBrowser().catch(() => {});
  }
  els.modal.innerHTML = html;
  els.modal.classList.remove('course-plan-modal');
  els.modal.classList.remove('onboarding-modal');
  els.backdrop.hidden = false;
  const focusable = els.modal.querySelector('button');
  if (focusable) focusable.focus();
}

function closeModal() {
  cleanupShadowTrial();
  pendingImportResult = null;
  stopKanaVoicePreview();
  stopMobileSpeechPlayback();
  els.backdrop.hidden = true;
  els.modal.innerHTML = '';
  els.modal.classList.remove('course-plan-modal');
  els.modal.classList.remove('onboarding-modal');
  if (ui.route === 'courses') scheduleCourseBrowserSync();
}

function cleanupShadowTrial() {
  if (!shadowSession) return;
  const session = shadowSession;
  shadowSession = null;
  if (session.timer) clearTimeout(session.timer);
  if (session.recorder) {
    session.recorder.onstop = null;
    session.recorder.ondataavailable = null;
    if (session.recorder.state !== 'inactive') {
      try {
        session.recorder.stop();
      } catch {
        // ignore cleanup errors
      }
    }
  }
  if (session.stream) {
    session.stream.getTracks().forEach((track) => track.stop());
  }
  if (session.nativeCapture) {
    bridge.cancelNativeRecording?.();
  }
  if (session.url) URL.revokeObjectURL(session.url);
  shadowShutdownCapture(session);
}

function shadowStatus(message, mode = '') {
  const element = document.getElementById('shadow-status');
  if (!element) return;
  element.textContent = message;
  element.className =
    mode === 'error'
      ? 'question-feedback no'
      : mode === 'ok'
        ? 'question-feedback ok'
        : 'panel-note';
}

async function audioDeviceList(kind) {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === kind);
}

function audioDeviceOptions(devices, fallbackLabel) {
  return devices
    .map(
      (device, index) =>
        `<option value="${esc(device.deviceId)}">${esc(device.label || `${fallbackLabel} ${index + 1}`)}</option>`,
    )
    .join('');
}

async function refreshAudioOutputDevices() {
  const select = document.getElementById('audio-output-device');
  if (!select) return;
  try {
    const devices = await audioDeviceList('audiooutput');
    select.innerHTML = [
      '<option value="">系统默认播放设备</option>',
      audioDeviceOptions(devices, '播放设备'),
    ].join('');
    const available = Array.from(select.options).some(
      (option) => option.value === preferredOutputDeviceId,
    );
    select.value = available ? preferredOutputDeviceId : '';
    const note = document.getElementById('audio-output-note');
    if (note && preferredOutputDeviceId && !available) {
      note.textContent =
        '已保存的耳机当前未出现在设备列表中。请检查连接状态或 Android 媒体输出设置。';
    }
  } catch {
    // Device enumeration can fail before media permission is granted.
  }
}

async function switchAudioOutput(deviceId, sourceSelect = null) {
  storePreferredOutputDevice(deviceId);
  const outputSelect = document.getElementById('audio-output-device');
  const shadowSelect = document.getElementById('shadow-output-device');
  if (outputSelect) outputSelect.value = deviceId;
  if (shadowSelect) shadowSelect.value = deviceId;
  const selected =
    sourceSelect || outputSelect || shadowSelect;
  const selectedLabel =
    selected?.selectedOptions?.[0]?.textContent || '系统默认播放设备';
  const audioElements = [
    currentAudio,
    document.getElementById('shadow-playback'),
  ].filter(Boolean);
  if (!supportsAudioOutputSelection()) {
    toast(`播放设备：${selectedLabel}`);
    return;
  }
  try {
    await Promise.all(
      audioElements.map((audio) => audio.setSinkId(deviceId || '')),
    );
    toast(`播放设备已切换：${selectedLabel}`);
  } catch (error) {
    console.warn('切换播放设备失败', error);
    storePreferredOutputDevice('');
    if (outputSelect) outputSelect.value = '';
    if (shadowSelect) shadowSelect.value = '';
    toast('无法切换到该播放设备，已改用系统默认设备');
  }
}

function openShadowTrial(element) {
  cleanupShadowTrial();
  const shadowText = element.dataset.shadowText || '';
  const shadowReading = element.dataset.shadowReading || '';
  const shadowAudioText = element.dataset.shadowAudioText || shadowText;
  const nativeRecording = bridge.hasNativeRecording?.() === true;
  shadowSession = {
    text: shadowText,
    reading: shadowReading,
    readingFallback: element.dataset.shadowHasReading !== 'true',
    zh: element.dataset.shadowZh || '',
    referenceAudioFile: shadowReferenceAudioFile(
      shadowAudioText,
      shadowReading,
    ),
    chunks: [],
    blob: null,
    url: null,
    stream: null,
    recorder: null,
    timer: null,
    audioContext: null,
    active: false,
    nativeCapture: false,
    recognizing: false,
    recognitionReady: false,
    recognitionProbing: false,
  };
  const standardRomaji = romajiHint(
    shadowSession.text,
    shadowSession.reading || shadowSession.text,
  );
  openModal(`
    <h3>跟读录音</h3>
    <p class="shadow-target-text"><strong>${esc(shadowSession.text)}</strong></p>
    <div class="shadow-target-reading">
      <span class="shadow-target-label">标准读音</span>
      ${kanaPairMarkup(shadowSession.reading, 'speech', true)}
      <span class="shadow-target-romaji">${
        standardRomaji
          ? `<small>罗马音</small>${esc(standardRomaji)}`
          : '罗马音暂时无法确认'
      }</span>
    </div>
    <p class="panel-note shadow-target-meaning">${esc(shadowSession.zh)}</p>
    ${shadowSession.readingFallback
      ? '<p class="panel-note">此条例句暂无独立假名读音，本次按原文文字比对，文字匹配度可能偏低。</p>'
      : ''}
    ${
      nativeRecording
        ? `<div class="shadow-device-label">
            录音输入
            <span class="panel-note">Android 系统默认麦克风（耳机麦克风由系统自动路由）</span>
          </div>`
        : `<label class="shadow-device-label">
            麦克风
            <select id="shadow-device" class="shadow-device" aria-label="选择麦克风">
              <option value="">系统默认麦克风</option>
            </select>
          </label>`
    }
    <label class="shadow-device-label">
      播放设备
      <select id="shadow-output-device" class="shadow-device" aria-label="选择播放设备">
        <option value="">系统默认播放设备</option>
      </select>
    </label>
    <div class="shadow-meter" aria-label="麦克风实时输入电平">
      <div id="shadow-meter-fill" class="shadow-meter-fill"></div>
    </div>
    <p id="shadow-device-info" class="panel-note">录音时会显示实际使用的麦克风和输入电平。</p>
    <div class="modal-actions shadow-primary-actions">
      <button id="shadow-record" class="primary-button shadow-record-button" type="button" data-action="shadow-record">● 开始录音</button>
      <button id="shadow-stop" class="secondary-button shadow-record-button shadow-stop-button" type="button" data-action="shadow-stop" hidden>■ 停止录音</button>
    </div>
    <audio id="shadow-playback" controls preload="auto" hidden style="width:100%;margin-top:12px"></audio>
    <div id="shadow-status" class="panel-note" aria-live="polite">最多录制 8 秒。录音只在本次试用中保留。</div>
    <p id="shadow-engine-status" class="panel-note" aria-live="polite">离线识别引擎：正在检查…</p>
    <div id="shadow-result"></div>
    <div class="modal-actions shadow-footer-actions">
      <button id="shadow-recognize" class="primary-button" type="button" data-action="shadow-recognize" hidden>识别并评分</button>
      <button id="shadow-delete" class="secondary-button" type="button" data-action="shadow-delete" hidden>删除录音</button>
      <button id="shadow-settings" class="secondary-button" type="button" data-action="shadow-open-settings" hidden>打开麦克风设置</button>
      <button class="secondary-button" type="button" data-action="modal-cancel">关闭</button>
    </div>`);
  refreshShadowDevices();
  refreshAudioOutputDevices();
  refreshShadowSpeechCapabilities();
}

async function refreshShadowSpeechCapabilities() {
  const element = document.getElementById('shadow-engine-status');
  if (!element) return;
  const session = shadowSession;
  if (!session) return;
  try {
    const capabilities = await bridge.getSpeechCapabilities?.();
    if (shadowSession !== session) return;
    if (capabilities?.recognitionReady) {
      session.recognitionReady = true;
      element.textContent =
        `离线识别：${capabilities.engine || 'Vosk'} · ${capabilities.model || '日语模型'} · ` +
        `${capabilities.nativeRecording ? 'Android 原生录音' : 'WebView 录音'}`;
      updateShadowRecognizeAvailability();
      return;
    }
    if (capabilities?.recognitionBundled) {
      session.recognitionProbing = true;
      element.textContent = '离线识别模型已内置，正在检查初始化与设备兼容性…';
      const probe = await bridge.probeSpeechRecognition?.();
      if (shadowSession !== session) return;
      session.recognitionProbing = false;
      if (probe?.ok) {
        session.recognitionReady = true;
        element.textContent =
          `离线识别：${probe.engine || 'Vosk'} · ${probe.model || '日语模型'} · ` +
          `${probe.nativeRecording ? 'Android 原生录音' : 'WebView 录音'}`;
        updateShadowRecognizeAvailability();
        return;
      }
      throw new Error(probe?.error || '离线识别模型初始化失败');
    }
    session.recognitionReady = false;
    session.recognitionProbing = false;
    element.textContent =
      '离线识别模型不可用；仍可录音回放，但不能生成识别文本匹配度。';
    element.className = 'question-feedback no';
    updateShadowRecognizeAvailability();
  } catch (error) {
    if (shadowSession !== session) return;
    session.recognitionReady = false;
    session.recognitionProbing = false;
    element.textContent = `离线识别不可用：${error?.message || '模型初始化失败'}；录音回放仍可使用。`;
    element.className = 'question-feedback no';
    updateShadowRecognizeAvailability();
  }
}

function updateShadowRecognizeAvailability() {
  const button = document.getElementById('shadow-recognize');
  if (!button || !shadowSession) return;
  const available =
    shadowSession.recognitionReady &&
    Boolean(shadowSession.blob) &&
    Boolean(shadowSession.quality?.canScore);
  button.hidden = !available;
  if (available) button.disabled = false;
}

function shadowMicrophoneErrorMessage(error) {
  const code = error?.code || error?.name || '';
  if (
    code === 'microphone-permission-denied' ||
    code === 'NotAllowedError' ||
    code === 'SecurityError'
  ) {
    const settings = document.getElementById('shadow-settings');
    if (settings) settings.hidden = false;
    return '麦克风权限被拒绝。请允许录音权限后点击“开始录音”，或在系统设置中为 Sakura 打开麦克风。';
  }
  if (code === 'NotFoundError' || code === 'DevicesNotFoundError') {
    return '没有找到可用麦克风。请连接设备麦克风或有线耳机麦克风后重试。';
  }
  if (
    code === 'NotReadableError' ||
    code === 'TrackStartError' ||
    code === 'recorder-busy'
  ) {
    return '麦克风被其他应用占用或暂时无法读取。请关闭正在录音的应用后重试。';
  }
  return error?.message || '麦克风录音失败，请检查权限和输入设备后重试。';
}

async function refreshShadowDevices(selectedId = '') {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return;
  }
  try {
    const select = document.getElementById('shadow-device');
    const allDevices = await navigator.mediaDevices.enumerateDevices();
    const devices = allDevices.filter((device) => device.kind === 'audioinput');
    if (select) {
      const current = selectedId || select.value;
      select.innerHTML = [
        '<option value="">系统默认麦克风</option>',
        ...devices.map(
          (device, index) =>
            `<option value="${esc(device.deviceId)}">${esc(device.label || `麦克风 ${index + 1}`)}</option>`,
        ),
      ].join('');
      if (current && devices.some((device) => device.deviceId === current)) {
        select.value = current;
      }
    }
    const outputSelect = document.getElementById('shadow-output-device');
    if (outputSelect) {
      outputSelect.innerHTML = [
        '<option value="">系统默认播放设备</option>',
        audioDeviceOptions(
          allDevices.filter((device) => device.kind === 'audiooutput'),
          '播放设备',
        ),
      ].join('');
      outputSelect.value = preferredOutputDeviceId;
    }
  } catch {
    // Device listing may be unavailable before the first permission grant.
  }
}

function shadowShutdownCapture(session) {
  if (!session) return;
  if (session.processor) {
    session.processor.onaudioprocess = null;
    try {
      session.processor.disconnect();
    } catch {
      // The node may already be disconnected.
    }
  }
  if (session.captureSource) {
    try {
      session.captureSource.disconnect();
    } catch {
      // The node may already be disconnected.
    }
  }
  if (session.captureGain) {
    try {
      session.captureGain.disconnect();
    } catch {
      // The node may already be disconnected.
    }
  }
  if (session.audioContext) {
    session.audioContext.close().catch(() => {});
  }
  session.processor = null;
  session.captureSource = null;
  session.captureGain = null;
  session.audioContext = null;
}

function shadowMeter(level = 0) {
  const fill = document.getElementById('shadow-meter-fill');
  if (fill) {
    fill.style.width = `${Math.min(100, Math.max(0, level))}%`;
  }
}

function startShadowPcmCapture(stream) {
  const session = shadowSession;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!session || !AudioContextClass) return false;

  let context;
  try {
    context = new AudioContextClass({ latencyHint: 'interactive' });
    if (typeof context.createScriptProcessor !== 'function') {
      context.close().catch(() => {});
      return false;
    }
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(2048, 1, 1);
    const gain = context.createGain();
    // Keep the processing graph alive without sending microphone audio back
    // to the speakers, which would create feedback.
    gain.gain.value = 0;
    source.connect(processor);
    processor.connect(gain);
    gain.connect(context.destination);

    session.audioContext = context;
    session.captureSource = source;
    session.processor = processor;
    session.captureGain = gain;
    session.captureSampleRate = context.sampleRate;
    session.captureChunks = [];
    session.captureLength = 0;
    session.capturePeak = 0;
    session.captureStartedAt = performance.now();
    session.lastMeterAt = 0;
    session.zeroLevelWarned = false;

    processor.onaudioprocess = (event) => {
      if (shadowSession !== session || !session.active) return;
      const input = event.inputBuffer.getChannelData(0);
      if (session.captureLength < context.sampleRate * 10) {
        const copy = new Float32Array(input.length);
        copy.set(input);
        session.captureChunks.push(copy);
        session.captureLength += copy.length;
      }

      let sumSquares = 0;
      let blockPeak = 0;
      for (let index = 0; index < input.length; index += 1) {
        const value = input[index];
        sumSquares += value * value;
        blockPeak = Math.max(blockPeak, Math.abs(value));
      }
      session.capturePeak = Math.max(session.capturePeak, blockPeak);

      const now = performance.now();
      if (now - session.lastMeterAt >= 70) {
        session.lastMeterAt = now;
        const rms = Math.sqrt(sumSquares / Math.max(1, input.length));
        shadowMeter(Math.sqrt(rms) * 240);
        if (
          !session.zeroLevelWarned &&
          now - session.captureStartedAt > 900 &&
          session.capturePeak < 0.0005
        ) {
          session.zeroLevelWarned = true;
          shadowStatus(
            '麦克风已连接，但输入电平几乎为 0。请检查所选麦克风、耳机麦克风静音键和系统麦克风权限。',
            'error',
          );
        }
      }
    };

    context.resume().catch(() => {});
    return true;
  } catch (error) {
    console.warn('直接音频采集不可用，改用 MediaRecorder', error);
    try {
      context?.close();
    } catch {
      // Ignore cleanup failures after an initialization error.
    }
    return false;
  }
}

function shadowDownsample(samples, sourceRate, targetRate = 16000) {
  if (sourceRate === targetRate) return samples;
  const ratio = sourceRate / targetRate;
  const length = Math.max(1, Math.floor(samples.length / ratio));
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(
      samples.length,
      Math.max(start + 1, Math.floor((index + 1) * ratio)),
    );
    let total = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      total += samples[sampleIndex];
    }
    output[index] = total / Math.max(1, end - start);
  }
  return output;
}

function resetShadowRecordingButtons() {
  const record = document.getElementById('shadow-record');
  const stop = document.getElementById('shadow-stop');
  if (record) {
    record.textContent = '● 开始录音';
    record.hidden = false;
    record.disabled = false;
  }
  if (stop) {
    stop.hidden = true;
    stop.classList.remove('recording');
  }
  shadowMeter(0);
}

function shadowQualityDetail(quality) {
  if (!quality) return '';
  const duration = Number(quality.metrics?.durationSeconds || 0).toFixed(1);
  const peak = Math.round(Math.min(1, quality.metrics?.peak || 0) * 100);
  return ` · ${duration} 秒 · 峰值 ${peak}%`;
}

function audioDataToArrayBuffer(data) {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  return null;
}

async function decodeAudioBytesToMono16k(data) {
  const arrayBuffer = audioDataToArrayBuffer(data);
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const OfflineContextClass =
    window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!arrayBuffer || !AudioContextClass || !OfflineContextClass) return null;

  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    const targetRate = 16000;
    const length = Math.max(1, Math.ceil(decoded.duration * targetRate));
    const offline = new OfflineContextClass(1, length, targetRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    await context.close().catch(() => {});
  }
}

async function loadReferenceAcousticFeatures(fileName) {
  if (!fileName || typeof bridge.readAudioAsset !== 'function') return null;
  const cached = readReferenceAcousticCache(fileName);
  if (cached.hit) return cached.value;
  try {
    const bytes = await bridge.readAudioAsset(fileName);
    const samples = await decodeAudioBytesToMono16k(bytes);
    const features = samples ? acousticAnalyzeSignal(samples, 16000) : null;
    const result = {
      samples,
      sampleRate: 16000,
      features,
    };
    writeReferenceAcousticCache(fileName, result);
    return result;
  } catch (error) {
    console.warn('标准音频声学分析不可用', error);
    writeReferenceAcousticCache(fileName, null);
    return null;
  }
}

async function acousticPronunciationAnalyzer(input) {
  const acoustic = analyzeJapanesePronunciationAcoustics({
    samples: input.samples,
    sampleRate: input.sampleRate,
    referenceFeatures: input.referenceFeatures,
    expectedReading: input.expectedReading,
  });
  const moraAlignment = analyzeJapaneseMoraAlignment({
    userSamples: input.samples,
    userSampleRate: input.sampleRate,
    referenceSamples: input.referenceSamples,
    referenceSampleRate: input.referenceSampleRate || 16000,
    expectedReading: input.expectedReading,
    sourceText: input.sourceText,
    textMatchScore: input.textMatchScore,
    recordingQuality: input.recordingQuality,
  });
  return {
    acoustic,
    moraAlignment,
    longVowels: {
      score: null,
      status: acoustic.longVowels.status,
      details: acoustic.longVowels,
    },
    gemination: {
      score: null,
      status: acoustic.gemination.status,
      details: acoustic.gemination,
    },
    pitch: {
      score: null,
      status: acoustic.pitch.status,
      details: acoustic.pitch,
    },
  };
}

registerPronunciationAnalyzer(
  'local-acoustic-baseline-v1',
  acousticPronunciationAnalyzer,
);

function markShadowRecordingReady(session, detail = '', quality = null) {
  session.url = URL.createObjectURL(session.blob);
  const playback = document.getElementById('shadow-playback');
  if (playback) {
    playback.src = session.url;
    playback.hidden = false;
    routeAudioOutput(playback).catch(() => {});
  }
  const record = document.getElementById('shadow-record');
  const stop = document.getElementById('shadow-stop');
  const recognize = document.getElementById('shadow-recognize');
  const remove = document.getElementById('shadow-delete');
  if (record) {
    record.textContent = '● 重新录音';
    record.hidden = false;
    record.disabled = false;
  }
  if (stop) {
    stop.hidden = true;
    stop.classList.remove('recording');
  }
  if (recognize) {
    recognize.disabled = false;
  }
  if (remove) remove.hidden = false;
  updateShadowRecognizeAvailability();
  shadowMeter(0);
  if (quality && !quality.canScore) {
    shadowStatus(
      `${shadowQualityMessage(quality)} 本次录音不会进入评分，可以回放后重新录制。`,
      'error',
    );
  } else {
    shadowStatus(
      `录音完成（${Math.round(session.blob.size / 1024)} KB）${detail}。${
        quality ? shadowQualityMessage(quality) : '可以回放、识别或删除。'
      }`,
      quality?.warnings?.length ? '' : 'ok',
    );
  }
}

async function finishShadowPcmRecording(auto) {
  const session = shadowSession;
  if (!session || session.finishing) return;
  session.finishing = true;
  session.active = false;
  const chunks = session.captureChunks || [];
  const sampleRate = session.captureSampleRate || 48000;
  const totalLength = session.captureLength || 0;
  shadowShutdownCapture(session);
  if (session.stream) {
    session.stream.getTracks().forEach((track) => track.stop());
    session.stream = null;
  }

  if (!chunks.length || !totalLength) {
    resetShadowRecordingButtons();
    shadowStatus('没有采集到有效音频，请确认麦克风正在输入声音', 'error');
    session.finishing = false;
    return;
  }

  const samples = new Float32Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    samples.set(chunk, offset);
    offset += chunk.length;
  });
  const quality = shadowAnalyzeRecording(samples, sampleRate);
  const analysisSamples = shadowDownsample(samples, sampleRate, 16000);
  session.captureChunks = [];
  session.captureLength = 0;
  session.analysisSamples = analysisSamples;
  session.analysisSampleRate = 16000;
  session.quality = quality;
  session.recognitionWav = shadowWavBuffer(analysisSamples, 16000);
  session.blob = new Blob([session.recognitionWav], { type: 'audio/wav' });
  session.finishing = false;
  markShadowRecordingReady(session, shadowQualityDetail(quality), quality);
  if (auto) toast('已达到 8 秒，录音已自动完成');
}

async function startShadowRecording() {
  if (!shadowSession) return;
  if (shadowSession.active) return;
  if (shadowSession.recognizing) {
    toast('正在识别上一段录音，请稍候');
    return;
  }
  if (bridge.hasNativeRecording?.()) {
    await startNativeShadowRecording();
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices?.getUserMedia ||
    (!AudioContextClass && typeof MediaRecorder === 'undefined')
  ) {
    shadowStatus('当前运行环境不支持麦克风录音', 'error');
    return;
  }
  try {
    const deviceId = document.getElementById('shadow-device')?.value;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    });
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('没有找到可用的麦克风');
    }
    audioTracks.forEach((track) => {
      track.enabled = true;
    });
    const actualSettings = audioTracks[0].getSettings?.() || {};
    refreshShadowDevices(actualSettings.deviceId || deviceId);
    shadowSession.stream = stream;
    shadowSession.active = true;
    shadowSession.finishing = false;
    shadowSession.recognitionWav = null;
    shadowSession.analysisSamples = null;
    shadowSession.analysisSampleRate = 0;
    shadowSession.quality = null;
    shadowSession.chunks = [];
    shadowSession.blob = null;
    if (shadowSession.url) {
      URL.revokeObjectURL(shadowSession.url);
      shadowSession.url = null;
    }
    shadowSession.recorder = null;
    shadowMeter(0);

    const pcmStarted = startShadowPcmCapture(stream);
    if (!pcmStarted) {
      if (typeof MediaRecorder === 'undefined') {
        throw new Error('当前运行环境无法采集音频');
      }
      let recorder;
      try {
        recorder = new MediaRecorder(stream);
      } catch {
        const preferredTypes = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/ogg;codecs=opus',
        ];
        const mimeType = preferredTypes.find((type) =>
          MediaRecorder.isTypeSupported(type),
        );
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
      }
      shadowSession.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          shadowSession.chunks.push(event.data);
        }
      };
      recorder.onerror = () => {
        shadowSession.active = false;
        resetShadowRecordingButtons();
        shadowStatus('录音失败，请检查麦克风权限', 'error');
      };
      recorder.onstop = async () => {
        const session = shadowSession;
        if (!session) return;
        session.active = false;
        if (session.stream) {
          session.stream.getTracks().forEach((track) => track.stop());
          session.stream = null;
        }
        session.recorder = null;
        if (!session.chunks.length) {
          resetShadowRecordingButtons();
          shadowStatus('没有录到声音，请重试', 'error');
          return;
        }
        session.blob = new Blob(session.chunks, {
          type: recorder.mimeType || 'audio/webm',
        });
        session.chunks = [];
        session.recognitionWav = null;
        if (session.blob.size < 100) {
          resetShadowRecordingButtons();
          shadowStatus('录音没有产生有效音频，请检查麦克风输入', 'error');
          return;
        }
        try {
          const prepared = await shadowBlobToWav(session.blob);
          if (shadowSession !== session) return;
          session.recognitionWav = prepared.wav;
          session.analysisSamples = prepared.samples;
          session.analysisSampleRate = 16000;
          session.quality = prepared.quality;
          markShadowRecordingReady(
            session,
            shadowQualityDetail(prepared.quality),
            prepared.quality,
          );
        } catch (error) {
          resetShadowRecordingButtons();
          shadowStatus(
            `录音分析失败：${shadowMicrophoneErrorMessage(error)}`,
            'error',
          );
        }
      };
      recorder.start(250);
    }

    const actualRate =
      actualSettings.sampleRate || shadowSession.captureSampleRate || 0;
    const actualChannels = actualSettings.channelCount || 1;
    const deviceInfo = document.getElementById('shadow-device-info');
    if (deviceInfo) {
      deviceInfo.textContent = `实际输入：${audioTracks[0].label || '系统默认麦克风'} · ${actualRate || '未知'} Hz · ${actualChannels} 声道 · ${pcmStarted ? '直接 PCM 采集' : 'MediaRecorder 兼容采集'}`;
    }
    const recordButton = document.getElementById('shadow-record');
    const stopButton = document.getElementById('shadow-stop');
    if (recordButton) {
      recordButton.hidden = true;
      recordButton.disabled = false;
    }
    if (stopButton) {
      stopButton.hidden = false;
      stopButton.classList.add('recording');
    }
    shadowStatus(
      `正在录音，请朗读标准句。注意下方电平条应有明显变化。`,
    );
    shadowSession.timer = setTimeout(() => stopShadowRecording(true), 8000);
  } catch (error) {
    if (shadowSession) {
      shadowSession.active = false;
      shadowShutdownCapture(shadowSession);
    }
    if (shadowSession?.stream) {
      shadowSession.stream.getTracks().forEach((track) => track.stop());
      shadowSession.stream = null;
    }
    if (shadowSession) shadowSession.recorder = null;
    resetShadowRecordingButtons();
    shadowStatus(
      `无法使用麦克风：${shadowMicrophoneErrorMessage(error)}`,
      'error',
    );
  }
}

function stopShadowRecording(auto = false) {
  if (!shadowSession?.active) return;
  if (shadowSession.timer) clearTimeout(shadowSession.timer);
  shadowSession.timer = null;
  shadowStatus(auto ? '已达到 8 秒，正在处理录音…' : '正在处理录音…');
  if (shadowSession.nativeCapture) {
    finishNativeShadowRecording(auto).catch((error) => {
      resetShadowRecordingButtons();
      shadowStatus(
        `处理录音失败：${shadowMicrophoneErrorMessage(error)}`,
        'error',
      );
    });
    return;
  }
  if (shadowSession.recorder) {
    if (shadowSession.recorder.state !== 'inactive') {
      shadowSession.recorder.stop();
    }
  } else {
    finishShadowPcmRecording(auto).catch((error) => {
      resetShadowRecordingButtons();
      shadowStatus(`处理录音失败：${error?.message || '请重试'}`, 'error');
    });
  }
}

async function startNativeShadowRecording() {
  const session = shadowSession;
  if (!session) return;
  session.active = true;
  session.finishing = false;
  session.nativeCapture = true;
  session.recognitionWav = null;
  session.analysisSamples = null;
  session.analysisSampleRate = 0;
  session.quality = null;
  session.chunks = [];
  session.blob = null;
  session.capturePeak = 0;
  if (session.url) {
    URL.revokeObjectURL(session.url);
    session.url = null;
  }
  const record = document.getElementById('shadow-record');
  const stop = document.getElementById('shadow-stop');
  const settings = document.getElementById('shadow-settings');
  if (record) {
    record.disabled = true;
    record.textContent = '正在启动麦克风…';
  }
  if (settings) settings.hidden = true;
  shadowMeter(0);
  shadowStatus('正在请求麦克风权限并启动 Android 原生录音…');

  try {
    const started = await bridge.startNativeRecording({
      onLevel(level) {
        if (shadowSession === session && session.active) {
          shadowMeter(level);
        }
      },
    });
    if (shadowSession !== session) {
      bridge.cancelNativeRecording?.();
      return;
    }
    const deviceInfo = document.getElementById('shadow-device-info');
    if (deviceInfo) {
      deviceInfo.textContent =
        `实际输入：Android 系统麦克风 · ${started?.sampleRate || 16000} Hz · 单声道 · 原生录音`;
    }
    if (record) {
      record.hidden = true;
      record.disabled = false;
    }
    if (stop) {
      stop.hidden = false;
      stop.classList.add('recording');
    }
    shadowStatus('正在录音，请朗读标准句。下方电平条应有明显变化。');
    session.timer = setTimeout(() => stopShadowRecording(true), 8000);
  } catch (error) {
    if (shadowSession === session) {
      session.active = false;
      session.nativeCapture = false;
    }
    resetShadowRecordingButtons();
    shadowStatus(
      `无法使用麦克风：${shadowMicrophoneErrorMessage(error)}`,
      'error',
    );
  }
}

async function finishNativeShadowRecording(auto = false) {
  const session = shadowSession;
  if (!session?.nativeCapture || session.finishing) return;
  session.finishing = true;
  session.active = false;
  if (session.timer) clearTimeout(session.timer);
  session.timer = null;
  try {
    const result = await bridge.stopNativeRecording();
    if (shadowSession !== session) return;
    if (!result?.ok || !result.wav) {
      throw new Error(result?.error || '没有取得有效录音');
    }
    session.nativeCapture = false;
    session.blob = new Blob([result.wav], { type: 'audio/wav' });
    const prepared = await shadowBlobToWav(session.blob);
    if (shadowSession !== session) return;
    session.recognitionWav = prepared.wav;
    session.analysisSamples = prepared.samples;
    session.analysisSampleRate = 16000;
    session.quality = prepared.quality;
    session.finishing = false;
    markShadowRecordingReady(
      session,
      shadowQualityDetail(prepared.quality),
      prepared.quality,
    );
    if (auto) toast('已达到 8 秒，录音已自动完成');
  } catch (error) {
    session.nativeCapture = false;
    session.finishing = false;
    throw error;
  }
}

function deleteShadowRecording() {
  if (!shadowSession) return;
  if (shadowSession.timer) clearTimeout(shadowSession.timer);
  shadowSession.timer = null;
  shadowSession.active = false;
  if (shadowSession.nativeCapture) {
    bridge.cancelNativeRecording?.();
    shadowSession.nativeCapture = false;
  }
  if (shadowSession.recorder && shadowSession.recorder.state !== 'inactive') {
    shadowSession.recorder.onstop = null;
    shadowSession.recorder.stop();
  }
  shadowShutdownCapture(shadowSession);
  if (shadowSession.stream) {
    shadowSession.stream.getTracks().forEach((track) => track.stop());
    shadowSession.stream = null;
  }
  if (shadowSession.url) URL.revokeObjectURL(shadowSession.url);
  shadowSession.chunks = [];
  shadowSession.blob = null;
  shadowSession.recognitionWav = null;
  shadowSession.analysisSamples = null;
  shadowSession.analysisSampleRate = 0;
  shadowSession.quality = null;
  shadowSession.url = null;
  shadowSession.recorder = null;
  shadowSession.captureChunks = [];
  shadowSession.captureLength = 0;
  shadowSession.capturePeak = 0;
  const playback = document.getElementById('shadow-playback');
  if (playback) {
    playback.pause();
    playback.removeAttribute('src');
    playback.hidden = true;
  }
  const record = document.getElementById('shadow-record');
  if (record) {
    record.textContent = '● 开始录音';
    record.hidden = false;
    record.disabled = false;
  }
  const stop = document.getElementById('shadow-stop');
  if (stop) {
    stop.hidden = true;
    stop.classList.remove('recording');
  }
  const recognize = document.getElementById('shadow-recognize');
  if (recognize) recognize.hidden = true;
  const remove = document.getElementById('shadow-delete');
  if (remove) remove.hidden = true;
  const settings = document.getElementById('shadow-settings');
  if (settings) settings.hidden = true;
  const result = document.getElementById('shadow-result');
  if (result) result.innerHTML = '';
  shadowMeter(0);
  shadowStatus('录音已删除，本次没有保存录音。');
}

function shadowWavBuffer(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => {
    const value = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  });
  return buffer;
}

async function shadowBlobToWav(blob) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const OfflineContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AudioContextClass || !OfflineContextClass) {
    throw new Error('当前运行环境不支持音频解码');
  }
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const targetRate = 16000;
    const length = Math.max(1, Math.ceil(decoded.duration * targetRate));
    const offline = new OfflineContextClass(1, length, targetRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    const quality = shadowAnalyzeRecording(samples, targetRate);
    return {
      samples,
      quality,
      wav: shadowWavBuffer(samples, targetRate),
    };
  } finally {
    await context.close().catch(() => {});
  }
}

async function recognizeShadow() {
  const session = shadowSession;
  if (!session?.blob) {
    shadowStatus('请先录制一段录音', 'error');
    return;
  }
  if (session.recognizing) return;
  if (!session.recognitionReady) {
    shadowStatus(
      session.recognitionProbing
        ? '离线识别模型仍在准备中，请稍候再试'
        : '当前设备无法使用离线识别模型，请重新打开跟读面板或查看状态提示',
      'error',
    );
    return;
  }
  session.recognizing = true;
  const button = document.getElementById('shadow-recognize');
  const record = document.getElementById('shadow-record');
  const remove = document.getElementById('shadow-delete');
  if (button) button.disabled = true;
  if (record) record.disabled = true;
  if (remove) remove.disabled = true;
  shadowStatus('正在使用本地日语识别，请稍候…');
  try {
    let wav = session.recognitionWav;
    if (!wav) {
      const prepared = await shadowBlobToWav(session.blob);
      if (shadowSession !== session) return;
      session.recognitionWav = prepared.wav;
      session.analysisSamples = prepared.samples;
      session.analysisSampleRate = 16000;
      session.quality = prepared.quality;
      wav = prepared.wav;
    }
    if (!session.quality?.canScore) {
      shadowStatus(shadowQualityMessage(session.quality), 'error');
      const recognizeButton = document.getElementById('shadow-recognize');
      if (recognizeButton) recognizeButton.hidden = true;
      return;
    }
    const result = await bridge.recognizeSpeech(wav);
    if (shadowSession !== session) return;
    if (!result || !result.ok) {
      throw new Error(result?.error || '没有识别到语音');
    }
    const usesReading =
      !session.readingFallback && Boolean(session.reading);
    const expected = session.reading || session.text;
    const recognizedReading = shadowRecognitionReading(
      result.text,
      result.words,
      SHADOW_READING_LEXICON,
    );
    const alignment = alignShadowText(expected, recognizedReading);
    const referenceAudio = await loadReferenceAcousticFeatures(
      session.referenceAudioFile,
    );
    if (shadowSession !== session) return;
    const pronunciation = await analyzePronunciationFeatures({
      samples: session.analysisSamples,
      sampleRate: session.analysisSampleRate || 16000,
      expectedReading: alignment.expected,
      recognizedReading: alignment.actual,
      textMatchScore: alignment.score,
      sourceText: session.text,
      recordingQuality: session.quality,
      referenceFeatures: referenceAudio?.features || null,
      referenceSamples: referenceAudio?.samples || null,
      referenceSampleRate: referenceAudio?.sampleRate || 16000,
    });
    if (shadowSession !== session) return;
    const kanaWithRomaji = (value) => {
      const romaji = romajiHint(value, value);
      return romaji ? `${value}（${romaji}）` : value;
    };
    const diffItems = [
      alignment.missing.length
        ? `漏读/未匹配：${kanaWithRomaji(alignment.missing.join(''))}`
        : '',
      alignment.extra.length
        ? `多读：${kanaWithRomaji(alignment.extra.join(''))}`
        : '',
      alignment.substitutions.length
        ? `替换：${alignment.substitutions
            .map(
              (item) =>
                `${kanaWithRomaji(item.expected)} → ${kanaWithRomaji(item.actual)}`,
            )
            .join('、')}`
        : '',
    ].filter(Boolean);
    const confidence =
      typeof result.confidence === 'number'
        ? ` · 识别置信度 ${Math.round(result.confidence * 100)}%`
        : '';
    const scoreLabel = usesReading ? '识别文本匹配度' : '文字匹配度';
    const speechComparison = renderSpeechComparison({
      sourceText: session.text,
      sourceReading: session.reading,
      recognizedText: result.text,
      recognizedReading,
      score: alignment.score,
    });
    const reservedDimensions = PRONUNCIATION_DIMENSIONS.map(
      (name) => PRONUNCIATION_DIMENSION_LABELS[name] || name,
    ).join('、');
    const acoustic = pronunciation.acoustic;
    const acousticUser = acoustic?.user;
    const speechDuration = Number(
      acousticUser?.silence?.speechDurationSeconds || 0,
    ).toFixed(1);
    const totalDuration = Number(
      acousticUser?.durationSeconds || 0,
    ).toFixed(1);
    const energyDb = Number(acousticUser?.energy?.dbFS);
    const medianHz = Number(acousticUser?.f0?.medianHz);
    const acousticSummary = acoustic
      ? `
        <p><strong>基础声学特征：</strong>总时长 ${totalDuration} 秒 · 有效语音 ${speechDuration} 秒 · ${
          Number.isFinite(energyDb) ? `峰值能量 ${energyDb.toFixed(1)} dBFS` : '能量暂时无法判断'
        } · ${
          Number.isFinite(medianHz) ? `F0 中位数约 ${Math.round(medianHz)} Hz` : 'F0 暂时无法判断'
        }</p>
        <p><strong>不同语速：</strong>${esc(acoustic.durationAnalysis?.label || '暂时无法判断')}（${esc(acoustic.durationAnalysis?.reason || '证据不足')}）</p>
        <p><strong>长音：</strong>${esc(acoustic.longVowels?.label || '暂时无法判断')}（${esc(acoustic.longVowels?.reason || '证据不足')}）</p>
        <p><strong>促音：</strong>${esc(acoustic.gemination?.label || '暂时无法判断')}（${esc(acoustic.gemination?.reason || '证据不足')}）</p>
        <p><strong>基础音高变化：</strong>${esc(acoustic.pitch?.label || '暂时无法判断')}（${esc(acoustic.pitch?.reason || '证据不足')}）</p>`
      : '<p>基础声学特征暂时无法读取。</p>';
    const moraAlignment = pronunciation.moraAlignment;
    const moraTypeLabels = {
      normal: '普通',
      long: '长音',
      geminate: '促音',
      nasal: '拨音',
    };
    const moraTimeline =
      moraAlignment?.status === 'ok'
        ? `
          <p><strong>莫拉级近似对齐：</strong>完成（低置信） · 平均 DTW 距离 ${Number(
            moraAlignment.quality?.meanCost || 0,
          ).toFixed(2)} · 标准覆盖 ${Math.round(
            Number(moraAlignment.quality?.referenceCoverage || 0) * 100,
          )}% · 录音覆盖 ${Math.round(
            Number(moraAlignment.quality?.userCoverage || 0) * 100,
          )}%</p>
          <div class="mora-timeline" aria-label="莫拉近似时间区间">
            ${moraAlignment.moras
              .map(
                (mora) => `
                  <span class="mora-chip mora-${esc(mora.type)}">
                    <strong>${esc(mora.kana)}</strong>
                    <small>${
                      typeof mora.startSeconds === 'number'
                        ? `${mora.startSeconds.toFixed(2)}–${mora.endSeconds.toFixed(2)} 秒`
                        : '暂时无法判断'
                    }</small>
                    <em>${esc(moraTypeLabels[mora.type] || '莫拉')}</em>
                  </span>`,
              )
              .join('')}
          </div>
          <p>${esc(moraAlignment.disclaimer)}</p>`
        : `
          <p><strong>莫拉级近似对齐：</strong>暂时无法判断（${esc(
            moraAlignment?.reason || '缺少对齐数据',
          )}）</p>`;
    document.getElementById('shadow-result').innerHTML = `
      <div class="speech-match-card ${alignment.score >= 80 ? 'ok' : 'no'}">
        <div class="speech-match-head">
          <span>${scoreLabel}</span>
          <strong>${alignment.score}%</strong>
        </div>
        ${speechComparison}
        <div class="speech-diff${diffItems.length ? ' has-diff' : ''}">
          <strong>文字差异</strong>
          ${
            diffItems.length
              ? `<ul>${diffItems.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`
              : '<p>未发现文字级漏读、多读或替换。</p>'
          }
        </div>
      </div>
      <p class="panel-note">这是语音转文字后的${
        usesReading ? '识别文本匹配度' : '文字匹配度'
      }${confidence}，已统一平假名、片假名和常见长音写法。</p>
      <div class="shadow-pronunciation-status">
        <strong>真实发音准确度：尚未评分</strong>
        <p>上方分数只表示语音识别文本与标准假名的对齐程度，不能证明发音正确。</p>
        ${acousticSummary}
        ${moraTimeline}
        <p>音素级评分和完整日语音高重音评分尚未启用；扩展接口预留：${reservedDimensions}。</p>
      </div>`;
    shadowStatus('识别完成。可以回放录音，或删除本次录音。');
  } catch (error) {
    if (shadowSession === session) {
      shadowStatus(`识别失败：${error?.message || '请重试'}`, 'error');
    }
  } finally {
    session.recognizing = false;
    if (shadowSession === session) {
      if (button) button.disabled = false;
      if (record) record.disabled = false;
      if (remove) remove.disabled = false;
    }
  }
}

const KANA_VOICE_PREVIEW_SCHEMES = [
  {
    id: 'A',
    title: '自然柔和女声',
    voice: 'Nanami',
    file: 'A_soft_nanami.mp3',
    description: '较轻、较柔和的语调，适合长时间听辨。',
  },
  {
    id: 'B',
    title: '清晰标准女声',
    voice: 'Nanami',
    file: 'B_standard_nanami.mp3',
    description: '标准语速和音高，优先保证每个假名清晰。',
  },
  {
    id: 'C',
    title: '教师慢速女声',
    voice: 'Nanami',
    file: 'C_teacher_nanami.mp3',
    description: '较慢的教学节奏，便于跟读和辨认清浊音。',
  },
  {
    id: 'D',
    title: '附加男声对照',
    voice: 'Keita',
    file: 'D_standard_keita.mp3',
    description: '不同音色参考，帮助判断是否更偏好男声。',
  },
];

function stopKanaVoicePreview() {
  if (kanaPreviewAudio) {
    try {
      kanaPreviewAudio.pause();
      kanaPreviewAudio.currentTime = 0;
    } catch {
      // Ignore cleanup failures after the media element is detached.
    }
    kanaPreviewAudio = null;
  }
  const status = document.getElementById('kana-preview-status');
  if (status) status.textContent = '选择 A、B、C 或 D 进行试听，可重复播放。';
}

function playKanaVoicePreview(schemeId) {
  const scheme = KANA_VOICE_PREVIEW_SCHEMES.find(
    (item) => item.id === schemeId,
  );
  if (!scheme) return;
  stopKanaVoicePreview();
  const status = document.getElementById('kana-preview-status');
  const audio = new Audio(`../preview/kana-voice/${scheme.file}`);
  kanaPreviewAudio = audio;
  if (status) status.textContent = `正在播放方案 ${scheme.id}：${scheme.title}`;
  audio.addEventListener(
    'ended',
    () => {
      if (kanaPreviewAudio === audio) {
        kanaPreviewAudio = null;
        if (status) {
          status.textContent = `方案 ${scheme.id} 播放完毕，可再次点击试听。`;
        }
      }
    },
    { once: true },
  );
  audio.addEventListener(
    'error',
    () => {
      if (status) status.textContent = `方案 ${scheme.id} 加载失败，请检查试听资源。`;
      toast('试听音频加载失败');
    },
    { once: true },
  );
  routeAudioOutput(audio)
    .catch(() => {
      storePreferredOutputDevice('');
      return audio.setSinkId ? audio.setSinkId('').catch(() => {}) : undefined;
    })
    .then(() => audio.play())
    .catch(() => {
      toast('试听音频播放失败');
    });
}

function openKanaVoicePreview() {
  const testTokens = [
    'あ い う え お',
    'が ざ だ ば',
    'ぱ ぴ ぷ ぺ ぽ',
    'きゃ しゅ ちょ',
    'つ ふ ら り る れ ろ',
  ];
  openModal(`
    <h3>五十音发音试听</h3>
    <p>四套试听使用完全相同的内容。试听文件位于独立目录，不会替换正式五十音音频。</p>
    <div class="kana-preview-tokens">
      ${testTokens.map((group) => `<span>${esc(group)}</span>`).join('')}
    </div>
    <div class="kana-preview-grid">
      ${KANA_VOICE_PREVIEW_SCHEMES.map(
        (scheme) => `
        <section class="kana-preview-card">
          <span class="kana-preview-id">${scheme.id}</span>
          <div>
            <h4>${esc(scheme.title)}</h4>
            <p>${esc(scheme.description)}</p>
            <small>Engine: Microsoft Edge Neural · Voice: ${esc(scheme.voice)}</small>
          </div>
          <button class="primary-button" type="button"
            data-action="kana-preview-play" data-scheme="${scheme.id}">
            播放 ${scheme.id}
          </button>
        </section>`,
      ).join('')}
    </div>
    <div class="kana-preview-note">
      <strong>A/B/C 使用 Nanami 女声的不同教学风格；D 使用 Keita 男声。</strong>
      <p>本轮只生成试听，不应用到正式五十音图。试听生成需要联网；文件已经本地保存，播放时不需要再次联网。</p>
    </div>
    <p id="kana-preview-status" class="kana-preview-status">选择 A、B、C 或 D 进行试听，可重复播放。</p>
    <div class="modal-actions">
      <button class="secondary-button" type="button" data-action="kana-preview-stop">停止</button>
      <button class="secondary-button" type="button" data-action="modal-cancel">关闭</button>
    </div>`);
}

function openVoiceHelp() {
  openModal(`
    <h3>系统日语朗读后备不可用</h3>
    <p>Sakura 的词汇、例句和五十音会优先播放内置 MP3，不需要日语语音包。只有内置音频缺失、损坏或播放失败时，才会使用系统 TTS 后备。</p>
    <p>当前 Android 系统没有可用的日语 TTS 数据，因此受影响的后备朗读暂时不可用。</p>
    <p><strong>Android 设置路径（不同品牌名称可能略有差异）</strong><br />
      设置 → 系统 → 语言和输入法 → 文字转语音输出 → 选择语音引擎 → 安装语音数据 → 日本語
    </p>
    <p class="panel-note">语音由 Android TTS 引擎提供；是否可离线取决于已安装的语音包，部分系统 TTS 可能需要联网。</p>
    <div class="modal-actions">
      <button class="secondary-button" type="button" data-action="modal-cancel">稍后再说</button>
      <button class="primary-button" type="button" data-action="open-language-settings">打开系统设置</button>
    </div>`);
}

function confirmReset() {
  const authorization = state.authorization;
  const license = state.license;
  state = defaultState();
  if (authorization !== undefined) state.authorization = authorization;
  if (license !== undefined) state.license = license;
  resetTransientUi();
  scheduleSave();
  closeModal();
  go('home');
  toast('学习进度已重置');
}

function resetTransientUi() {
  ui.quiz = null;
  ui.lessonId = null;
  ui.lessonAnswers = {};
  ui.lessonResults = {};
  ui.selectedKana = null;
  ui.selectedWord = null;
}

function saveSummary(target) {
  const count = (map) =>
    map && typeof map === 'object' ? Object.keys(map).length : 0;
  return {
    kana: count(target?.kana),
    words: count(target?.words),
    grammar: count(target?.grammar),
    courses:
      (Array.isArray(target?.mobileCourses) ? target.mobileCourses.length : 0) +
      (Array.isArray(target?.webCourses?.favorites)
        ? target.webCourses.favorites.length
        : 0),
  };
}

function summaryText(target) {
  const summary = saveSummary(target);
  return `已学 ${summary.kana} 个假名 · 掌握 ${summary.words} 个词汇 · 完成 ${summary.grammar} 节语法 · 收藏 ${summary.courses} 个网课`;
}

function setBackupControlsBusy(busy, message = '') {
  document.querySelectorAll('[data-backup-action]').forEach((button) => {
    button.disabled = busy;
  });
  const info = document.getElementById('mobile-backup-info');
  if (info && message) {
    info.innerHTML = `<span></span>${esc(message)}`;
  }
}

async function refreshMobileBackupInfo() {
  const element = document.getElementById('mobile-backup-info');
  if (!element) return null;
  try {
    const info = await bridge.getLocalBackupInfo?.();
    if (!document.getElementById('mobile-backup-info')) return info;
    if (!info?.ok) {
      element.className = 'question-feedback no';
      element.textContent =
        info?.error || '无法读取应用内备份目录';
      return info;
    }
    element.className = 'data-status';
    if (!info.latest) {
      element.innerHTML =
        '<span></span>还没有自动备份。点击“一键备份”即可创建第一份。';
      return info;
    }
    const time = new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(Number(info.latest.modifiedAt) || Date.now()));
    element.innerHTML =
      `<span></span>最近备份：${esc(info.latest.fileName || '')} · ${esc(time)} · 共 ${Number(info.count) || 0} 份`;
    const pathElement = document.getElementById('mobile-backup-path');
    if (pathElement && info.directory) {
      pathElement.textContent = `默认备份目录：${info.directory}`;
    }
    return info;
  } catch (error) {
    element.className = 'question-feedback no';
    element.textContent = `读取备份信息失败：${error?.message || '请稍后重试'}`;
    return null;
  }
}

async function exportProgress() {
  setBackupControlsBusy(true, '正在创建应用内备份…');
  try {
    const saved = await flushSave();
    if (!saved) throw new Error('当前进度保存失败');
    const result = await bridge.exportSaveAuto(state);
    if (!result || result.canceled) return;
    if (!result.ok) throw new Error(result.error || '导出失败');
    const fileName =
      result.fileName ||
      String(result.filePath || '').split(/[\\/]/).pop() ||
      'JSON 文件';
    toast(`应用内备份已创建：${fileName}`);
  } catch (error) {
    console.error('导出存档失败', error);
    toast(`导出失败：${error?.message || '请稍后再试'}`);
  } finally {
    setBackupControlsBusy(false);
    await refreshMobileBackupInfo();
  }
}

async function exportProgressToFile() {
  setBackupControlsBusy(true, '正在打开系统保存界面…');
  try {
    const saved = await flushSave();
    if (!saved) throw new Error('当前进度保存失败');
    const result = await bridge.exportSave(state);
    if (!result || result.canceled) return;
    if (!result.ok) throw new Error(result.error || '保存备份副本失败');
    const fileName =
      result.fileName ||
      String(result.filePath || '').split(/[\\/]/).pop() ||
      'Sakura 备份';
    toast(`备份副本已保存：${fileName}`);
  } catch (error) {
    console.error('另存备份副本失败', error);
    toast(`另存失败：${error?.message || '请稍后再试'}`);
  } finally {
    setBackupControlsBusy(false);
    await refreshMobileBackupInfo();
  }
}

async function applyImportedState(result) {
  const previousState = state;
  state = normalizeState(result.state);
  const saved = await flushSave();
  if (!saved) {
    state = previousState;
    toast('存档读取成功，但保存失败，当前进度未改变');
    return;
  }
  resetTransientUi();
  pendingImportResult = null;
  closeModal();
  go('home');
  toast(`存档已导入：${summaryText(result.state)}`);
}

function openImportConfirmation(result) {
  pendingImportResult = result;
  const incoming = saveSummary(result.state);
  const current = saveSummary(state);
  const exportTime = result.exportedAt
    ? new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(result.exportedAt))
    : '未记录';
  const formatText =
    result.format === null || result.format === undefined
      ? '旧版/纯状态兼容格式'
      : `Sakura 备份格式 ${result.format}`;
  openModal(`
    <h3>确认覆盖当前学习数据？</h3>
    <p><strong>文件：</strong>${esc(result.fileName || 'Sakura-save.json')}</p>
    <p><strong>备份导出时间：</strong>${esc(exportTime)} · ${esc(formatText)}</p>
    <p><strong>备份内容：</strong>假名 ${incoming.kana} · 词汇 ${incoming.words} · 语法 ${incoming.grammar} · 网课 ${incoming.courses}</p>
    <p><strong>当前数据：</strong>假名 ${current.kana} · 词汇 ${current.words} · 语法 ${current.grammar} · 网课 ${current.courses}</p>
    ${
      Number(result.skipped) > 0
        ? `<p class="panel-note">已跳过 ${Number(result.skipped)} 个损坏或版本不兼容的新备份，本次使用的是最近一份有效文件。</p>`
        : ''
    }
    <p class="panel-note">继续后会覆盖手机中的学习进度、打卡、错题、学习计划、翻译历史及当前支持备份的课程记录。取消不会改动任何数据。</p>
    <div class="modal-actions">
      <button class="secondary-button" type="button" data-action="modal-cancel">取消</button>
      <button class="primary-button" type="button" data-action="import-confirm">确认覆盖并导入</button>
    </div>`);
}

async function confirmImportOverwrite() {
  const result = pendingImportResult;
  if (!result?.state) {
    toast('导入数据已失效，请重新选择备份');
    closeModal();
    return;
  }
  await applyImportedState(result);
}

async function chooseImport() {
  setBackupControlsBusy(true, '正在读取最近备份…');
  try {
    const currentSaved = await flushSave();
    if (!currentSaved) throw new Error('当前进度保存失败');
    const result = await bridge.importLatest();
    if (!result || !result.ok) {
      throw new Error(result?.error || '还没有一键导出的存档');
    }
    openImportConfirmation(result);
  } catch (error) {
    console.error('一键导入存档失败', error);
    toast(`导入失败：${error?.message || '没有可导入的存档'}`);
  } finally {
    setBackupControlsBusy(false);
    await refreshMobileBackupInfo();
  }
}

async function chooseImportFile() {
  setBackupControlsBusy(true, '正在打开系统文件选择器…');
  try {
    const currentSaved = await flushSave();
    if (!currentSaved) throw new Error('当前进度保存失败');
    const result = await bridge.importSave();
    if (!result || result.canceled) return;
    if (!result.ok) throw new Error(result.error || '读取备份失败');
    openImportConfirmation(result);
  } catch (error) {
    console.error('导入备份文件失败', error);
    toast(`导入失败：${error?.message || '文件无法读取'}`);
  } finally {
    setBackupControlsBusy(false);
    await refreshMobileBackupInfo();
  }
}

async function openDataFolder() {
  try {
    await bridge.openDataFolder();
  } catch (error) {
    console.error(error);
    toast('无法打开数据位置');
  }
}

document.addEventListener('click', (event) => {
  const actionTarget = event.target.closest('[data-action]');
  if (!actionTarget) return;
  const action = actionTarget.dataset.action;

  switch (action) {
    case 'navigate': {
      const route = actionTarget.dataset.route;
      const level = actionTarget.dataset.level || '';
      if (route === 'words' && STUDY_TARGET_LEVELS.includes(level)) {
        ui.wordLevel = level;
        ui.wordFilter = 'learning';
        ui.wordPage = 1;
      } else if (
        route === 'grammar' &&
        STUDY_TARGET_LEVELS.includes(level)
      ) {
        ui.grammarLevel = level;
        ui.grammarPage = 1;
      }
      go(route);
      break;
    }
    case 'kana-group':
      ui.kanaGroup = actionTarget.dataset.group || 'all';
      render();
      break;
    case 'kana-select': {
      const cell = KANA_CELLS.find((item) => item.id === actionTarget.dataset.kanaId);
      ui.selectedKana = actionTarget.dataset.kanaId;
      render(true);
      if (cell) speak(cell.hira);
      break;
    }
    case 'kana-toggle':
      toggleKana(actionTarget.dataset.kanaId);
      break;
    case 'kana-romaji':
      ui.hideRomaji = !ui.hideRomaji;
      render(true);
      break;
    case 'kana-voice-preview':
      openKanaVoicePreview();
      break;
    case 'kana-preview-play':
      playKanaVoicePreview(actionTarget.dataset.scheme || '');
      break;
    case 'kana-preview-stop':
      stopKanaVoicePreview();
      break;
    case 'kana-random': {
      const randomCell = KANA_CELLS[Math.floor(Math.random() * KANA_CELLS.length)];
      ui.selectedKana = randomCell.id;
      ui.kanaGroup = 'all';
      render(true);
      toast(`随机抽到「${randomCell.hira}」`);
      break;
    }
    case 'word-select':
      ui.selectedWord = actionTarget.dataset.wordId;
      render(true);
      break;
    case 'word-toggle':
      toggleWord(actionTarget.dataset.wordId);
      break;
    case 'word-filter':
      ui.wordFilter = actionTarget.dataset.filter || 'all';
      ui.wordPage = 1;
      render();
      break;
    case 'word-level':
      ui.wordLevel = actionTarget.dataset.level || 'all';
      ui.wordPage = 1;
      render();
      break;
    case 'word-theme':
      ui.wordTheme = actionTarget.dataset.theme || 'all';
      ui.wordPage = 1;
      render();
      break;
    case 'word-filter-clear':
      ui.wordFilter = 'all';
      ui.wordLevel = 'all';
      ui.wordPos = 'all';
      ui.wordTheme = 'all';
      ui.wordPage = 1;
      render();
      break;
    case 'word-page': {
      const page = Number.parseInt(actionTarget.dataset.page, 10);
      if (!Number.isFinite(page)) return;
      ui.wordPage = Math.max(1, page);
      render();
      break;
    }
    case 'course-search': {
      const input = document.getElementById('course-search');
      searchCourse(input?.value || ui.courseQuery);
      break;
    }
    case 'course-suggest':
      searchCourse(actionTarget.dataset.query || '');
      break;
    case 'course-favorite':
      addCurrentCourseFavorite();
      break;
    case 'course-capture-position':
      recordCurrentCoursePosition();
      break;
    case 'course-local-import':
      importLocalCourseResources();
      break;
    case 'course-plan-edit':
      openCoursePlanEditor();
      break;
    case 'course-plan-dashboard':
      openCoursePlanDashboard();
      break;
    case 'course-plan-calendar-prev':
      shiftCoursePlanCalendar(-1);
      break;
    case 'course-plan-calendar-next':
      shiftCoursePlanCalendar(1);
      break;
    case 'course-plan-calendar-today':
      ui.courseCalendarMonth = todayKey().slice(0, 7);
      ui.courseCalendarSelectedDate = todayKey();
      openCoursePlanDashboard();
      break;
    case 'course-plan-calendar-select':
      ui.courseCalendarSelectedDate =
        actionTarget.dataset.date || ui.courseCalendarSelectedDate;
      openCoursePlanDashboard();
      break;
    case 'course-plan-task-complete':
      setCourseResourceStatus(
        actionTarget.dataset.courseId || '',
        actionTarget.dataset.chapterId || '',
        'completed',
        'plan',
      );
      break;
    case 'course-plan-suggest':
      suggestCoursePlan();
      break;
    case 'course-plan-accept':
      acceptCoursePlanSuggestion();
      break;
    case 'course-plan-ignore':
      updateCoursePlanSuggestion(null);
      break;
    case 'course-plan-save':
      saveCoursePlanFromModal();
      break;
    case 'course-plan-replan':
      rescheduleRemainingCourses();
      break;
    case 'course-schedule-complete':
      setCourseResourceStatus(
        actionTarget.dataset.courseId || '',
        actionTarget.dataset.chapterId || '',
        'completed',
      );
      break;
    case 'course-create':
      openCourseEditor();
      break;
    case 'course-resource-open':
      openCourseResource(actionTarget.dataset.courseId || '');
      break;
    case 'course-recent-open':
      openRecentCourse(actionTarget);
      break;
    case 'course-edit':
      openCourseEditor(actionTarget.dataset.courseId || '');
      break;
    case 'course-save':
      saveCourseFromModal();
      break;
    case 'course-order':
      moveCourseResource(
        actionTarget.dataset.courseId || '',
        Number(actionTarget.dataset.direction) < 0 ? -1 : 1,
      );
      break;
    case 'course-delete':
      confirmDeleteCourse(actionTarget.dataset.courseId || '');
      break;
    case 'course-delete-confirm':
      deleteCourseResource(actionTarget.dataset.courseId || '');
      break;
    case 'course-chapters':
      openCourseChapterManager(actionTarget.dataset.courseId || '');
      break;
    case 'course-chapter-import':
      importLocalCourseResources(actionTarget.dataset.courseId || '');
      break;
    case 'course-chapter-edit':
      openCourseChapterEditor(
        actionTarget.dataset.courseId || '',
        actionTarget.dataset.chapterId || '',
      );
      break;
    case 'course-chapter-save':
      saveCourseChapterFromModal();
      break;
    case 'course-chapter-order':
      moveCourseChapter(
        actionTarget.dataset.courseId || '',
        actionTarget.dataset.chapterId || '',
        Number(actionTarget.dataset.direction) < 0 ? -1 : 1,
      );
      break;
    case 'course-chapter-delete':
      deleteCourseChapter(
        actionTarget.dataset.courseId || '',
        actionTarget.dataset.chapterId || '',
      );
      break;
    case 'course-replace-local':
      replaceLocalCourseFile(actionTarget.dataset.courseId || '');
      break;
    case 'course-open':
      openSavedCourse(actionTarget.dataset.url || '');
      break;
    case 'course-remove':
      confirmDeleteCourse(actionTarget.dataset.courseId || '');
      break;
    case 'course-back':
      controlCourseBrowser('back');
      break;
    case 'course-forward':
      controlCourseBrowser('forward');
      break;
    case 'course-reload':
      controlCourseBrowser('reload');
      break;
    case 'course-home':
      controlCourseBrowser('home');
      break;
    case 'course-external':
      openCourseExternal();
      break;
    case 'course-retry':
      retryCourseBrowser();
      break;
    case 'study-plan-open':
      openStudyPlanEditor('edit');
      break;
    case 'study-plan-save':
      saveStudyPlanFromModal();
      break;
    case 'study-plan-skip':
      skipStudyPlanOnboarding();
      break;
    case 'study-plan-course':
      openPlanCourseSearch();
      break;
    case 'study-plan-course-done':
      markStudyCourseDay();
      break;
    case 'quiz-grammar-scope':
      ui.grammarQuizScope =
        actionTarget.dataset.scope === 'all' ? 'all' : 'plan';
      render();
      break;
    case 'translation-direction':
      ui.translationDirection =
        actionTarget.dataset.direction === 'zh-ja' ? 'zh-ja' : 'ja-zh';
      ui.translationResult = null;
      ui.translationStatus = 'idle';
      ui.translationError = '';
      ui.translationJapaneseText = '';
      render();
      break;
    case 'translation-run':
      performTranslation();
      break;
    case 'translation-clear':
      ui.translationSource = '';
      ui.translationResult = null;
      ui.translationStatus = 'idle';
      ui.translationError = '';
      ui.translationJapaneseText = '';
      render();
      break;
    case 'translation-history-open': {
      const history = normalizeTranslationHistory(state.translationHistory);
      const entry = history[Number(actionTarget.dataset.index)];
      if (!entry) {
        toast('这条翻译记录已经不可用');
        return;
      }
      ui.translationDirection = entry.direction;
      ui.translationSource = entry.source;
      ui.translationResult = {
        ok: true,
        text: entry.text,
        provider: entry.provider,
      };
      ui.translationStatus = 'success';
      ui.translationError = '';
      ui.translationJapaneseText = entry.japaneseText;
      render(true);
      break;
    }
    case 'translation-knowledge':
      openTranslationKnowledge(actionTarget);
      break;
    case 'calendar-prev':
      shiftCalendarMonth(-1);
      render(true);
      break;
    case 'calendar-next':
      shiftCalendarMonth(1);
      render(true);
      break;
    case 'calendar-today':
      ui.calendarMonth = todayKey().slice(0, 7);
      ui.calendarSelectedDate = todayKey();
      render(true);
      break;
    case 'calendar-select':
      ui.calendarSelectedDate =
        actionTarget.dataset.date || ui.calendarSelectedDate;
      render(true);
      break;
    case 'speak':
      speak(actionTarget.dataset.text || '');
      break;
    case 'lesson-open':
      openLesson(actionTarget.dataset.lessonId);
      break;
    case 'lesson-back':
      ui.lessonId = null;
      render();
      break;
    case 'grammar-level':
      ui.grammarLevel = actionTarget.dataset.level || 'all';
      ui.grammarPage = 1;
      render();
      break;
    case 'grammar-function':
      ui.grammarFunction = actionTarget.dataset.function || 'all';
      ui.grammarPage = 1;
      render();
      break;
    case 'grammar-filter-clear':
      ui.grammarLevel = 'all';
      ui.grammarFunction = 'all';
      ui.grammarPage = 1;
      render();
      break;
    case 'grammar-page': {
      const page = Number.parseInt(actionTarget.dataset.page, 10);
      if (!Number.isFinite(page)) return;
      ui.grammarPage = Math.max(1, page);
      render();
      break;
    }
    case 'open-next-lesson': {
      const next = nextPlannedGrammarLesson();
      if (!next) return;
      openLesson(next.id);
      break;
    }
    case 'lesson-option':
      chooseLessonOption(actionTarget);
      break;
    case 'lesson-check': {
      const container = actionTarget.closest('.question-inline');
      const input = container?.querySelector('input');
      if (!container || !input) return;
      checkLessonQuestion(actionTarget.dataset.qid, container, input.value);
      break;
    }
    case 'lesson-complete': {
      const lesson = CONTENT_GRAMMAR_BY_ID[actionTarget.dataset.lessonId];
      if (!lesson) return;
      markLessonComplete(lesson, false);
      render(true);
      break;
    }
    case 'quiz-start':
      startQuiz(
        actionTarget.dataset.mode,
        Number(actionTarget.dataset.count) || QUESTIONS_PER_QUIZ,
      );
      break;
    case 'quiz-round-next': {
      const round = nextPracticeRound();
      startQuiz(round.mode, round.count);
      break;
    }
    case 'quiz-answer':
      submitQuizAnswer(actionTarget.dataset.value);
      break;
    case 'quiz-submit-fill': {
      const input = document.getElementById('quiz-fill');
      submitQuizAnswer(input ? input.value : '');
      break;
    }
    case 'quiz-next':
      nextQuizQuestion();
      break;
    case 'quiz-exit':
      exitQuiz();
      break;
    case 'quiz-restart':
      startQuiz(
        actionTarget.dataset.mode || 'kana',
        Number(actionTarget.dataset.count) || QUESTIONS_PER_QUIZ,
      );
      break;
    case 'voice-help':
      openVoiceHelp();
      break;
    case 'shadow-open':
      openShadowTrial(actionTarget);
      break;
    case 'shadow-record':
      startShadowRecording();
      break;
    case 'shadow-stop':
      stopShadowRecording();
      break;
    case 'shadow-recognize':
      recognizeShadow();
      break;
    case 'shadow-delete':
      deleteShadowRecording();
      break;
    case 'shadow-open-settings':
      Promise.resolve(bridge.openMicrophoneSettings?.()).catch(() => {
        toast('请手动打开系统应用设置并授予麦克风权限');
      });
      break;
    case 'open-language-settings':
      closeModal();
      Promise.resolve(bridge.openLanguageSettings?.()).catch(() => {
        toast('请手动打开系统语言设置');
      });
      break;
    case 'open-sound-settings':
      Promise.resolve(bridge.openSoundSettings?.()).catch(() => {
        toast('请从 Android 控制中心或系统设置调整媒体输出');
      });
      break;
    case 'test-audio-output':
      speak('あ');
      break;
    case 'open-data-folder':
      openDataFolder();
      break;
    case 'export-save':
      exportProgress();
      break;
    case 'export-save-file':
      exportProgressToFile();
      break;
    case 'import-save':
      chooseImport();
      break;
    case 'import-file':
      chooseImportFile();
      break;
    case 'import-confirm':
      confirmImportOverwrite();
      break;
    case 'reset-progress': {
      const summary = saveSummary(state);
      openModal(`
        <h3>重置学习进度？</h3>
        <p>将清空已学的 ${summary.kana} 个假名、${summary.words} 个词汇、${summary.grammar} 节语法和全部测验记录。</p>
        <p class="panel-note">建议先在「数据」页面导出存档；重置后应用内将无法恢复。内置课程内容不会受影响。</p>
        <div class="modal-actions">
          <button class="secondary-button" type="button" data-action="modal-cancel">取消</button>
          <button class="secondary-button" type="button" data-action="modal-reset"
            style="color:var(--danger);border-color:#d9c2bd">确认重置</button>
        </div>`);
      break;
    }
    case 'modal-cancel':
      closeModal();
      break;
    case 'modal-reset':
      confirmReset();
      break;
    default:
      break;
  }
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'study-duration-value') {
    updateStudyPlanPreview();
  } else if (event.target.id === 'word-search') {
    ui.wordQuery = event.target.value;
    ui.wordPage = 1;
    render(true);
    const input = document.getElementById('word-search');
    if (input) {
      input.focus();
      const length = input.value.length;
      input.setSelectionRange(length, length);
    }
  } else if (event.target.id === 'grammar-search') {
    ui.grammarQuery = event.target.value;
    ui.grammarPage = 1;
    render(true);
    const input = document.getElementById('grammar-search');
    if (input) {
      input.focus();
      const length = input.value.length;
      input.setSelectionRange(length, length);
    }
  } else if (event.target.id === 'course-search') {
    ui.courseQuery = event.target.value;
  } else if (event.target.id === 'translation-source') {
    ui.translationSource = event.target.value;
  }
});

document.addEventListener('change', (event) => {
  if (
    [
      'study-current-level',
      'study-target-level',
      'study-duration-unit',
      'study-daily-minutes',
      'study-weekly-days',
      'study-daily-practice-groups',
      'study-practice-question-count',
      'study-daily-courses',
    ].includes(event.target.id)
  ) {
    if (event.target.id === 'study-current-level') {
      const currentLevel = event.target.value;
      const targetField = document.getElementById('study-target-level');
      if (
        targetField &&
        !studyPlanTargetIsValid(currentLevel, targetField.value)
      ) {
        targetField.value = suggestedTargetForFoundation(currentLevel);
      }
    }
    updateStudyPlanPreview();
    return;
  }
  if (
    event.target.id === 'practice-daily-groups' ||
    event.target.id === 'practice-question-count'
  ) {
    if (event.target.id === 'practice-daily-groups') {
      state.studyPlan.dailyPracticeGroups = normalizePracticeGroupCount(
        event.target.value,
      );
    } else {
      state.studyPlan.practiceQuestionsPerRound =
        normalizePracticeQuestionCount(event.target.value);
    }
    state.studyPlan.updatedAt = Date.now();
    scheduleSave();
    render(true);
    toast('每日练习目标已更新');
    return;
  }
  if (event.target.id === 'course-daily-target') {
    const count = Number(event.target.value);
    state.studyPlan.dailyCourseTarget = COURSE_DAILY_TARGETS.includes(count)
      ? count
      : 0;
    state.studyPlan.updatedAt = Date.now();
    if (state.studyPlan.coursePlanConfigured) {
      state.webCourses.courseSchedule = buildCoursePlanSchedule(
        state.studyPlan,
        true,
      );
    }
    scheduleSave();
    render(true);
    toast(
      state.studyPlan.dailyCourseTarget
        ? `每日网课目标已设为 ${state.studyPlan.dailyCourseTarget} 节`
        : '已取消固定网课任务',
    );
    return;
  }
  const wordFilters = {
    'word-level-filter': 'wordLevel',
    'word-pos-filter': 'wordPos',
    'word-theme-filter': 'wordTheme',
  };
  if (wordFilters[event.target.id]) {
    ui[wordFilters[event.target.id]] = event.target.value;
    ui.wordPage = 1;
    render(true);
    return;
  }
  const grammarFilters = {
    'grammar-function-filter': 'grammarFunction',
  };
  if (grammarFilters[event.target.id]) {
    ui[grammarFilters[event.target.id]] = event.target.value;
    ui.grammarPage = 1;
    render(true);
    return;
  }
  if (event.target.id === 'course-save-level') {
    ui.courseSaveLevel = normalizeCourseLevel(event.target.value);
    return;
  }
  if (event.target.dataset.courseChapterStatusCourseId) {
    setCourseResourceStatus(
      event.target.dataset.courseChapterStatusCourseId,
      event.target.dataset.courseChapterId || '',
      event.target.value,
    );
    return;
  }
  if (event.target.dataset.courseStatusId) {
    updateCourseFavoriteStatus(
      event.target.dataset.courseStatusId,
      event.target.value,
    );
    return;
  }
  if (
    event.target.id === 'audio-output-device' ||
    event.target.id === 'shadow-output-device'
  ) {
    switchAudioOutput(event.target.value, event.target);
    return;
  }
  if (event.target.id === 'shadow-device' && !shadowSession?.active) {
    const info = document.getElementById('shadow-device-info');
    if (info) {
      info.textContent = event.target.value
        ? '已选择指定麦克风；开始录音后会显示实际使用的设备。'
        : '将使用当前系统默认麦克风。';
    }
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!els.backdrop.hidden) closeModal();
    return;
  }

  if (
    (event.ctrlKey || event.metaKey) &&
    event.key === 'Enter' &&
    ui.route === 'translate' &&
    ui.translationStatus !== 'loading'
  ) {
    event.preventDefault();
    performTranslation();
    return;
  }

  if (event.key === 'Enter') {
    if (ui.route === 'quiz' && ui.quiz && !ui.quiz.finished) {
      if (ui.quiz.answered) {
        event.preventDefault();
        nextQuizQuestion();
      } else if (
        ui.quiz.questions[ui.quiz.index].type === 'fill' &&
        event.target.id === 'quiz-fill'
      ) {
        event.preventDefault();
        submitQuizAnswer(event.target.value);
      }
    } else if (
      ui.route === 'courses' &&
      event.target.id === 'course-search'
    ) {
      event.preventDefault();
      searchCourse(event.target.value);
    } else if (
      ui.route === 'grammar' &&
      ui.lessonId &&
      event.target.id &&
      event.target.id.startsWith('fill-')
    ) {
      event.preventDefault();
      checkLessonQuestion(
        event.target.id.slice(5),
        event.target.closest('.question-inline'),
        event.target.value,
      );
    }
    return;
  }

  if (ui.route === 'quiz' && ui.quiz && !ui.quiz.finished && !ui.quiz.answered) {
    const question = ui.quiz.questions[ui.quiz.index];
    const number = Number(event.key);
    if (
      question.type === 'choice' &&
      Number.isInteger(number) &&
      number >= 1 &&
      number <= question.options.length
    ) {
      submitQuizAnswer(question.options[number - 1]);
    }
  }
});

els.backdrop.addEventListener('click', (event) => {
  if (event.target === els.backdrop) closeModal();
});

els.dataFolder.addEventListener('click', openDataFolder);

if (
  typeof navigator !== 'undefined' &&
  navigator.mediaDevices?.addEventListener
) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    if (ui.route === 'data') refreshAudioOutputDevices();
    if (shadowSession) refreshShadowDevices();
  });
}

window.addEventListener('beforeunload', () => {
  const addedSeconds = commitStudyClock();
  if (saveTimer || addedSeconds > 0) bridge.saveState(state);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    const addedSeconds = commitStudyClock();
    if (saveTimer || addedSeconds > 0) flushSave();
  } else {
    studyClockLastTick = Date.now();
  }
});

for (const eventName of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
  document.addEventListener(eventName, markStudyClockActivity, {
    passive: true,
  });
}

if (typeof bridge.onCourseState === 'function') {
  bridge.onCourseState(handleCourseBrowserState);
}

window.addEventListener('resize', () => {
  if (ui.route === 'courses') scheduleCourseBrowserSync();
});

els.view.addEventListener('scroll', () => {
  if (ui.route === 'courses') scheduleCourseBrowserSync();
});

async function init() {
  await loadState();
  setSaveStatus('saved');
  try {
    const info = await bridge.getAppInfo();
    if (info) {
      appInfo = info;
      if (info.version) {
        els.version.textContent = `版本 ${info.version} · 数据保存在本机`;
      }
    }
  } catch {
    els.version.textContent = '数据保存在本机';
  }
  if (!bridge.hasNativeSpeech?.() && window.speechSynthesis) {
    refreshVoices();
    const onVoicesChanged = () => {
      refreshVoices();
      if (appReady && ui.route === 'kana') render(true);
    };
    if (typeof window.speechSynthesis.addEventListener === 'function') {
      window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
    }
    window.speechSynthesis.onvoiceschanged = onVoicesChanged;
  }
  render();
  appReady = true;
  startStudyClock();
  showStartupPlanGuide();
}

init().catch((error) => {
  console.error('应用初始化失败', error);
  els.view.innerHTML = `
    <div class="page">
      <div class="panel">
        <div class="empty">
          <div class="empty-mark">!</div>
          应用初始化失败，请重新启动。错误信息：${esc(error && error.message ? error.message : error)}
        </div>
      </div>
    </div>`;
});
