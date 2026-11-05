const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = __dirname;
const appSource = fs.readFileSync(
  path.join(ROOT, 'www', 'src', 'app.js'),
  'utf8',
);
const initMarker = '\ninit().catch((error) => {';
const initIndex = appSource.lastIndexOf(initMarker);
assert.ok(initIndex > 0);

const elementMap = new Map();
function makeElement() {
  return {
    value: '',
    textContent: '',
    innerHTML: '',
    hidden: false,
    className: '',
    style: {},
    dataset: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() {
        return false;
      },
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
    focus() {},
    setSelectionRange() {},
    appendChild() {},
    remove() {},
    click() {},
  };
}

const storage = new Map();
const documentStub = {
  readyState: 'loading',
  visibilityState: 'visible',
  getElementById(id) {
    if (!elementMap.has(id)) elementMap.set(id, makeElement());
    return elementMap.get(id);
  },
  createElement: makeElement,
  addEventListener() {},
  removeEventListener() {},
  querySelector() {
    return null;
  },
  querySelectorAll() {
    return [];
  },
  documentElement: makeElement(),
  body: makeElement(),
};
documentStub.documentElement.style.setProperty = () => {};

const context = {
  console,
  document: documentStub,
  localStorage: {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    removeItem(key) {
      storage.delete(key);
    },
  },
  navigator: {
    languages: ['zh-CN'],
    mediaDevices: null,
    userAgent: 'Sakura mobile test',
  },
  performance: { now: () => Date.now() },
  URL,
  Blob,
  TextEncoder,
  TextDecoder,
  setTimeout,
  clearTimeout,
  setInterval() {
    return 1;
  },
  clearInterval() {},
  requestAnimationFrame() {
    return 1;
  },
  cancelAnimationFrame() {},
  Intl,
  Math,
  Date,
  Map,
  Set,
  Promise,
  fetch: async () => {
    throw new Error('network disabled in test');
  },
};
vm.createContext(context);
context.window = context;
context.window.addEventListener = () => {};
context.window.removeEventListener = () => {};
context.window.location = {
  href: 'file:///android_asset/www/src/index.html',
};

function load(relativePath, transform = (value) => value) {
  const source = transform(
    fs.readFileSync(path.join(ROOT, relativePath), 'utf8'),
  );
  vm.runInContext(source, context, { filename: relativePath });
}

for (const file of [
  'www/src/data/kana.js',
  'www/src/romaji.js',
  'www/src/data/words.js',
  'www/src/data/grammar.js',
  'www/src/audio/manifest.js',
  'www/src/data/content.js',
  'www/src/shadow-utils.js',
  'www/src/acoustic-analysis.js',
  'www/src/mora-alignment.js',
  'www/src/pronunciation-analysis.js',
  'www/src/mobile-bridge.js',
]) {
  load(file);
}
load('www/src/app.js', (source) => source.slice(0, initIndex));
load('www/src/mobile-word-sheet.js');
load('www/src/mobile-course.js');

const result = vm.runInContext(
  `(() => {
    const homeHtml = renderHome();
    const quickEntries = (homeHtml.match(/data-route="(?:kana|words|grammar|quiz|translate|courses)"/g) || []).length;
    const kanaHtml = renderKana();
    const imported = normalizeState({
      kana: { a: 1700000000001 },
      words: { w1: 1700000000002 },
      grammar: { g1: { at: 1700000000003 } },
      quizzes: [{ id: 'q1', at: 1700000000004 }],
      practiceSessions: [{
        id: 'p1',
        startedAt: 1700000000005,
        status: 'completed',
        plannedCount: 10,
        answeredCount: 10,
        score: 9,
      }],
      translationHistory: [{
        at: 1700000000006,
        direction: 'ja-zh',
        source: '学生です',
        text: '是学生。',
      }],
      activity: [{ type: 'words', title: '学习词汇', at: 1700000000007 }],
      streak: { last: '2026-10-25', days: 3 },
      stats: { answered: 10, correct: 8 },
      studySecondsByDay: { '2026-10-25': 600 },
      studyPlan: {
        configured: true,
        currentLevel: 'zero',
        targetLevel: 'N5',
        durationValue: 6,
        durationUnit: 'months',
        startedAt: 1700000000000,
      },
      webCourses: { favorites: [], recent: [], courseSessions: [] },
      mobileCourses: [{ id: 'mobile-1', title: 'N5 网课' }],
    });
    state.mobileCourses = [{
      id: 'mobile-course-test',
      title: '大家的日语 N5',
      totalLessons: 25,
      completedLessons: 5,
      category: '教材',
      level: 'N5',
      checkins: ['2026-10-25'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];
    const html = renderCourse();
    state.studyPlan = normalizeStudyPlan({
      configured: true,
      currentLevel: 'zero',
      targetLevel: 'N5',
      durationValue: 3,
      durationUnit: 'months',
      dailyMinutes: 30,
      weeklyStudyDays: 5,
    });
    state.kana = {};
    const zeroMetrics = studyPlanMetrics();
    const zeroTaskIds = buildDailyTaskPlan(zeroMetrics).map((task) => task.id);
    state.kana = Object.fromEntries(
      KANA_CELLS.map((cell) => [cell.id, Date.now()]),
    );
    const n5Metrics = studyPlanMetrics();
    const n1Plan = normalizeStudyPlan({
      configured: true,
      currentLevel: 'N1',
      targetLevel: 'N1',
      durationValue: 3,
      durationUnit: 'months',
      dailyMinutes: 60,
      weeklyStudyDays: 5,
    });
    const reviewWord = n5Metrics.focusWordPool[0];
    const reviewGrammar = n5Metrics.focusGrammarPool[0];
    const reviewNow = Date.now();
    state.words[reviewWord.id] = reviewNow - 2 * DAY_MILLISECONDS;
    state.grammar[reviewGrammar.id] = {
      score: 1,
      total: 1,
      at: reviewNow - 2 * DAY_MILLISECONDS,
    };
    scheduleInitialReview('word', reviewWord.id, state.words[reviewWord.id]);
    scheduleInitialReview(
      'grammar',
      reviewGrammar.id,
      state.grammar[reviewGrammar.id].at,
    );
    state.reviewSchedule.items[reviewEntryKey('word', reviewWord.id)].nextReviewAt =
      reviewNow - DAY_MILLISECONDS;
    state.reviewSchedule.items[reviewEntryKey('grammar', reviewGrammar.id)].nextReviewAt =
      reviewNow - DAY_MILLISECONDS;
    const mobileDueCount = collectReviewItems(
      studyPlanMetrics(),
      { dueOnly: true },
    ).length;
    const spacedQuiz = buildQuiz('spaced', 2);
    recordReviewOutcome('word', reviewWord.id, true, 'mobile-test', reviewNow);
    const stageQuiz = buildQuiz('stage-test', 5);
    return {
      title: html.includes('网课进度打卡'),
      add: html.includes('新增网课'),
      checkin: html.includes('今日打卡'),
      progress: html.includes('5/25'),
      bilibili: html.toLowerCase().includes('bilibili'),
      checkins: courseSessionCountForDate('2026-10-25'),
      quickEntries,
      mobileSheet: Boolean(document.querySelector('.mobile-word-sheet')),
      kanaAudioWarning: kanaHtml.includes('voice-warning'),
      kanaAudioMissing: kanaBundledAudioMissing(),
      wordReferenceAudio: shadowReferenceAudioFile('学生', 'がくせい'),
      wordReferenceMissing: CONTENT_WORDS.filter(
        (word) => !shadowReferenceAudioFile(word.word, word.kana),
      ).length,
      onboardingStatus: imported.onboarding.status,
      zeroStage: zeroMetrics.stage.title,
      zeroTaskIds,
      n5Stage: n5Metrics.stage.title,
      n5HasWords: buildDailyTaskPlan(n5Metrics).some((task) => task.id === 'words'),
      n1Consolidation: n1Plan.configured,
      mobileDueCount,
      spacedCount: spacedQuiz.questions.length,
      reviewInterval:
        state.reviewSchedule.items[reviewEntryKey('word', reviewWord.id)]
          .intervalDays,
      stageQuizCount: stageQuiz.questions.length,
      stageQuizAllN5: stageQuiz.questions.every(
        (question) =>
          reviewContentLevel(question.knowledgeType, question.knowledgeId) ===
          'N5',
      ),
      noPlanTasks: buildDailyTaskPlan(null).length,
      imported: {
        kana: Object.keys(imported.kana).length,
        words: Object.keys(imported.words).length,
        grammar: Object.keys(imported.grammar).length,
        quizzes: imported.quizzes.length,
        practiceSessions: imported.practiceSessions.length,
        translations: imported.translationHistory.length,
        activity: imported.activity.length,
        streakDays: imported.streak.days,
        studySeconds: imported.studySecondsByDay['2026-10-25'],
        mobileCourses: imported.mobileCourses.length,
        planTarget: imported.studyPlan.targetLevel,
      },
    };
  })()`,
  context,
);

assert.equal(result.title, true);
assert.equal(result.add, true);
assert.equal(result.checkin, true);
assert.equal(result.progress, true);
assert.equal(result.bilibili, false);
assert.equal(result.checkins, 1);
assert.equal(result.quickEntries >= 6, true);
assert.equal(result.kanaAudioWarning, false);
assert.equal(result.kanaAudioMissing, 0);
assert.match(result.wordReferenceAudio, /\.mp3$/);
assert.equal(result.wordReferenceMissing, 0);
assert.equal(result.onboardingStatus, 'existing');
assert.equal(result.zeroStage, '五十音起步');
assert.deepEqual(result.zeroTaskIds.includes('words'), false);
assert.equal(result.n5Stage, 'N5 阶段');
assert.equal(result.n5HasWords, true);
assert.equal(result.n1Consolidation, true);
assert.equal(result.mobileDueCount, 2);
assert.equal(result.spacedCount, 2);
assert.equal(result.reviewInterval, 3);
assert.equal(result.stageQuizCount, 5);
assert.equal(result.stageQuizAllN5, true);
assert.equal(result.noPlanTasks, 0);
assert.deepEqual(
  { ...result.imported },
  {
    kana: 1,
    words: 1,
    grammar: 1,
    quizzes: 1,
    practiceSessions: 1,
    translations: 1,
    activity: 1,
    streakDays: 3,
    studySeconds: 600,
    mobileCourses: 1,
    planTarget: 'N5',
  },
);

const bridgeResult = vm.runInContext(
  `(async () => {
    await window.journey.saveState({
      version: 1,
      marker: 'saved',
      onboarding: { status: 'completed', completedAt: 1700000000000 },
      studyPlan: { configured: true, currentLevel: 'kana', targetLevel: 'N5' },
      reviewSchedule: {
        schemaVersion: 1,
        items: {
          'word:w1': {
            type: 'word',
            id: 'w1',
            intervalDays: 7,
          },
        },
      },
      authorization: { active: true, planIndependent: true },
    });
    return window.journey.loadState();
  })()`,
  context,
);

bridgeResult
  .then((saved) => {
    assert.equal(saved.marker, 'saved');
    assert.equal(saved.onboarding.status, 'completed');
    assert.equal(saved.studyPlan.currentLevel, 'kana');
    assert.equal(saved.reviewSchedule.items['word:w1'].intervalDays, 7);
    assert.equal(saved.authorization.planIndependent, true);
    console.log('mobile runtime tests passed: course tracker, plan restart and local storage');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
