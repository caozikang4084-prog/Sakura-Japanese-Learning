const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = __dirname;
const desktopSave = require(path.join(
  ROOT,
  '..',
  'installer-build',
  'save-format.js',
));
const bridgeSource = fs.readFileSync(
  path.join(ROOT, 'www', 'src', 'mobile-bridge.js'),
  'utf8',
);
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

const mobileState = {
  version: 1,
  startedAt: 1700000000000,
  kana: { a: 1700000000001, i: 1700000000002 },
  words: { w1: 1700000000003 },
  grammar: { g1: { at: 1700000000004, completed: true } },
  quizzes: [{ id: 'quiz-1', at: 1700000000005, score: 8 }],
  practiceSessions: [
    {
      id: 'practice-1',
      startedAt: 1700000000006,
      status: 'completed',
      plannedCount: 10,
      answeredCount: 10,
      score: 9,
    },
  ],
  translationHistory: [
    {
      id: 'translation-1',
      at: 1700000000007,
      direction: 'ja-zh',
      source: '学生です',
      text: '是学生。',
    },
  ],
  activity: [{ type: 'words', title: '学习词汇', at: 1700000000008 }],
  streak: { last: '2026-10-25', days: 7 },
  stats: { answered: 20, correct: 17 },
  studySecondsByDay: { '2026-10-25': 900 },
  onboarding: {
    schemaVersion: 1,
    status: 'completed',
    completedAt: 1700000000010,
    skippedAt: 0,
    reminderDismissedAt: 0,
  },
  reviewSchedule: {
    schemaVersion: 1,
    items: {
      'word:w1': {
        type: 'word',
        id: 'w1',
        masteredAt: 1700000000003,
        lastReviewedAt: 1700000000010,
        nextReviewAt: 1700000000011,
        intervalDays: 7,
        correctStreak: 2,
        lapses: 1,
        lastResult: 'correct',
        source: 'spaced',
        updatedAt: 1700000000010,
      },
    },
  },
  authorization: {
    active: true,
    planIndependent: true,
  },
  studyPlan: {
    configured: true,
    currentLevel: 'zero',
    targetLevel: 'N5',
    durationValue: 6,
    durationUnit: 'months',
    startedAt: 1700000000000,
    targetDate: 1715552000000,
    dailyMinutes: 30,
    weeklyStudyDays: 6,
    dailyPracticeGroups: 2,
    practiceQuestionsPerRound: 10,
    dailyCourseTarget: 2,
    coursePlanConfigured: true,
    courseStartDate: '2026-10-01',
    courseTargetDate: '2026-12-31',
    courseTargetCount: 25,
    courseDailyMinutes: 30,
    courseIntensity: 'standard',
    coursePlanUpdatedAt: 1700000000009,
    courseDays: ['2026-10-25'],
    updatedAt: 1700000000009,
  },
  webCourses: {
    schemaVersion: 1,
    favorites: [
      {
        id: 'course-1',
        title: '大家的日语',
        url: 'https://www.bilibili.com/video/BV1test',
        status: 'learning',
      },
    ],
    recent: [],
    courseSessions: [],
    courseSchedule: [],
    lastUrl: '',
    lastTitle: '',
  },
  mobileCourses: [
    {
      id: 'mobile-course-1',
      title: 'N5 网课',
      totalLessons: 24,
      completedLessons: 6,
      checkins: ['2026-10-24', '2026-10-25'],
    },
  ],
};

let exported = null;
let localBackup = null;
global.SakuraNative = {
  exportLearningBackup(json, fileName) {
    exported = { json, fileName };
    global.SakuraMobileBackup.exportFinished({
      ok: true,
      fileName,
      bytes: Buffer.byteLength(json, 'utf8'),
    });
  },
  createLocalLearningBackup(json, fileName) {
    localBackup = { json, fileName };
    global.SakuraMobileBackup.localExportFinished({
      ok: true,
      fileName,
      bytes: Buffer.byteLength(json, 'utf8'),
      filePath: `Android/data/com.sakura.mobile/files/Documents/Sakura/Backups/${fileName}`,
      directory:
        'Android/data/com.sakura.mobile/files/Documents/Sakura/Backups',
    });
  },
  getLocalLearningBackupInfo() {
    return JSON.stringify({
      ok: true,
      directory:
        'Android/data/com.sakura.mobile/files/Documents/Sakura/Backups',
      count: 1,
      latest: localBackup
        ? {
            fileName: localBackup.fileName,
            bytes: Buffer.byteLength(localBackup.json, 'utf8'),
            modifiedAt: 1761374400000,
          }
        : null,
    });
  },
  readLatestLocalLearningBackup() {
    global.SakuraMobileBackup.latestImportFinished({
      ok: true,
      fileName: localBackup.fileName,
      bytes: Buffer.byteLength(localBackup.json, 'utf8'),
      modifiedAt: 1761374400000,
      text: localBackup.json,
    });
  },
  importLearningBackup() {
    const desktopJson = JSON.stringify(
      desktopSave.buildSaveFile(mobileState, new Date('2026-10-25T08:00:00Z')),
    );
    global.SakuraMobileBackup.importFinished({
      ok: true,
      fileName: 'Sakura-save-desktop.json',
      bytes: Buffer.byteLength(desktopJson, 'utf8'),
      text: desktopJson,
    });
  },
};

(async () => {
  const exportedResult = await global.window.journey.exportSaveAuto(mobileState);
  assert.equal(exportedResult.ok, true);
  assert.match(localBackup.fileName, /^Sakura-save-\d{4}-\d{2}-\d{2}-/);
  const desktopParsed = desktopSave.parseSaveFile(localBackup.json);
  assert.deepEqual(desktopParsed.state, mobileState);
  const envelope = JSON.parse(localBackup.json);
  assert.equal(envelope.app, 'nihongo-journey');
  assert.equal(envelope.format, 1);
  assert.match(envelope.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
  const temporaryDirectory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'sakura-backup-test-'),
  );
  try {
    const exportedPath = path.join(temporaryDirectory, localBackup.fileName);
    await fs.promises.writeFile(exportedPath, localBackup.json, 'utf8');
    const desktopFileResult = await desktopSave.readSaveFile(exportedPath);
    assert.deepEqual(desktopFileResult.state, mobileState);
  } finally {
    await fs.promises.rm(temporaryDirectory, {
      recursive: true,
      force: true,
    });
  }

  const backupInfo = global.window.journey.getLocalBackupInfo();
  assert.equal(backupInfo.ok, true);
  assert.equal(backupInfo.latest.fileName, localBackup.fileName);
  const latestResult = await global.window.journey.importLatest();
  assert.equal(latestResult.ok, true);
  assert.deepEqual(latestResult.state, mobileState);

  const copyResult = await global.window.journey.exportSave(mobileState);
  assert.equal(copyResult.ok, true);
  assert.match(exported.fileName, /^Sakura-save-/);
  assert.deepEqual(
    desktopSave.parseSaveFile(exported.json).state,
    mobileState,
  );

  const importedResult = await global.window.journey.importSave();
  assert.equal(importedResult.ok, true);
  assert.equal(importedResult.fileName, 'Sakura-save-desktop.json');
  assert.deepEqual(importedResult.state, mobileState);
  assert.equal(importedResult.format, 1);

  global.SakuraNative.importLearningBackup = () => {
    const unsupported = JSON.stringify({
      app: 'nihongo-journey',
      format: 99,
      state: mobileState,
    });
    global.SakuraMobileBackup.importFinished({
      ok: true,
      fileName: 'future.json',
      text: unsupported,
    });
  };
  const unsupportedResult = await global.window.journey.importSave();
  assert.equal(unsupportedResult.ok, false);
  assert.match(unsupportedResult.error, /格式版本/);

  global.SakuraNative.importLearningBackup = () => {
    global.SakuraMobileBackup.importFinished({
      ok: true,
      fileName: 'broken.json',
      text: '{broken',
    });
  };
  const brokenResult = await global.window.journey.importSave();
  assert.equal(brokenResult.ok, false);
  assert.match(brokenResult.error, /JSON/);

  global.SakuraNative.importLearningBackup = () => {
    global.SakuraMobileBackup.importFinished({
      ok: false,
      canceled: true,
    });
  };
  const canceled = await global.window.journey.importSave();
  assert.equal(canceled.ok, false);
  assert.equal(canceled.canceled, true);

  console.log('mobile backup compatibility tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
