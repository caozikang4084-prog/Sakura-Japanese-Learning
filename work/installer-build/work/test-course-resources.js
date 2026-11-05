const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const failures = [];
let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`FAIL ${name}: ${error?.stack || error}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`FAIL ${name}: ${error?.stack || error}`);
  }
}

function makeElement() {
  const classes = new Set();
  return {
    value: '',
    textContent: '',
    innerHTML: '',
    hidden: false,
    className: '',
    style: {},
    dataset: {},
    classList: {
      add(...names) {
        names.forEach((name) => classes.add(name));
      },
      remove(...names) {
        names.forEach((name) => classes.delete(name));
      },
      toggle(name, force) {
        if (force === undefined ? !classes.has(name) : force) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
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
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 800, height: 500 };
    },
    focus() {},
    setSelectionRange() {},
    appendChild() {},
    remove() {},
    click() {},
  };
}

const elements = new Map();
const getElement = (id) => {
  if (!elements.has(id)) elements.set(id, makeElement());
  return elements.get(id);
};

const documentStub = {
  readyState: 'loading',
  visibilityState: 'visible',
  getElementById: getElement,
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

const windowStub = {
  journey: {
    loadState: async () => null,
    saveState: async () => ({ ok: true }),
    getAppInfo: async () => ({ version: '1.5.4', dataPath: '' }),
    onCourseState: () => () => {},
  },
  addEventListener() {},
  removeEventListener() {},
  location: { href: 'file:///src/index.html' },
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
};

const context = vm.createContext({
  console,
  document: documentStub,
  window: windowStub,
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {},
    removeItem() {},
  },
  navigator: {
    languages: ['zh-CN'],
    mediaDevices: null,
    userAgent: 'Node test',
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
});

for (const file of [
  'src/data/kana.js',
  'src/romaji.js',
  'src/data/words.js',
  'src/data/grammar.js',
  'src/audio/manifest.js',
  'src/data/content.js',
  'src/shadow-utils.js',
  'src/acoustic-analysis.js',
  'src/mora-alignment.js',
  'src/pronunciation-analysis.js',
]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, {
    filename: file,
  });
}

const appSource = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
const initIndex = appSource.lastIndexOf('\ninit().catch((error) => {');
assert.ok(initIndex > 0);
vm.runInContext(appSource.slice(0, initIndex), context, {
  filename: 'src/app.js',
});

const run = (source) => vm.runInContext(`(() => { ${source} })()`, context);
const runAsync = (source) =>
  vm.runInContext(`(async () => { ${source} })()`, context);

test('旧 B站收藏继续兼容并补齐新字段', () => {
  const result = run(`
    const normalized = normalizeWebCourses({
      favorites: [{
        id: 'legacy-1',
        title: '旧课程',
        url: 'https://www.bilibili.com/video/BV1LEGACY',
        level: 'N5',
        status: 'learning',
      }],
    });
    return normalized.favorites[0];
  `);
  assert.equal(result.id, 'legacy-1');
  assert.equal(result.resourceType, 'bilibili');
  assert.equal(result.kind, 'lesson');
  assert.equal(result.status, 'learning');
  assert.equal(result.category, '综合日语');
  assert.equal(result.localPath, '');
  assert.equal(result.chapters.length, 0);
});

test('本地路径和章节异常数据不会导致加载崩溃', () => {
  const result = run(`
    const normalized = normalizeWebCourses({
      favorites: [
        null,
        { title: '无资源' },
        {
          id: 'group-1',
          kind: 'course',
          title: '本地课程组',
          chapters: [
            { id: 'c1', title: '第一章', localPath: 'C:\\\\Course\\\\01.mp4', durationMinutes: 30 },
            { id: 'c2', title: '缺失路径', localPath: 'relative/path.mp4' },
          ],
        },
      ],
    });
    return normalized.favorites;
  `);
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, 'course');
  assert.equal(result[0].chapters.length, 1);
  assert.equal(result[0].chapters[0].title, '第一章');
});

test('课程状态完成时只生成一次实际完成记录', () => {
  const result = run(`
    const course = normalizeWebCourses({
      favorites: [{
        id: 'local-1',
        title: '本地视频',
        localPath: 'C:\\\\Course\\\\lesson.mp4',
        durationMinutes: 25,
      }],
    }).favorites[0];
    state.webCourses = {
      schemaVersion: 1,
      favorites: [course],
      recent: [],
      courseSessions: [],
      lastUrl: '',
      lastTitle: '',
    };
    setCourseResourceStatus(course.id, '', 'completed');
    setCourseResourceStatus(course.id, '', 'completed');
    return {
      status: state.webCourses.favorites[0].status,
      sessions: state.webCourses.courseSessions.length,
      completed: state.webCourses.courseSessions[0].completed,
      today: courseSessionCountForDate(todayKey()),
    };
  `);
  assert.equal(result.status, 'completed');
  assert.equal(result.sessions, 1);
  assert.equal(result.completed, true);
  assert.equal(result.today, 1);
});

test('章节完成会更新课程组进度但打开不会自动完成', () => {
  const result = run(`
    const course = normalizeWebCourses({
      favorites: [{
        id: 'group-1',
        kind: 'course',
        title: '课程组',
        chapters: [
          { id: 'c1', title: '第一章', localPath: 'C:\\\\Course\\\\01.mp4', durationMinutes: 30 },
          { id: 'c2', title: '第二章', localPath: 'C:\\\\Course\\\\02.mp4', durationMinutes: 20 },
        ],
      }],
    }).favorites[0];
    state.webCourses = {
      schemaVersion: 1,
      favorites: [course],
      recent: [],
      courseSessions: [],
      lastUrl: '',
      lastTitle: '',
    };
    course.chapters[0].status = 'learning';
    syncCourseGroupStatus(course);
    const afterOpen = { status: course.status, percent: course.progressPercent };
    setCourseResourceStatus(course.id, 'c1', 'completed');
    const afterComplete = { status: course.status, percent: course.progressPercent };
    setCourseResourceStatus(course.id, 'c2', 'completed');
    const final = { status: course.status, percent: course.progressPercent };
    return { afterOpen, afterComplete, final, sessions: state.webCourses.courseSessions.length };
  `);
  assert.equal(result.afterOpen.status, 'learning');
  assert.equal(result.afterOpen.percent, 0);
  assert.equal(result.afterComplete.percent, 50);
  assert.equal(result.final.status, 'completed');
  assert.equal(result.final.percent, 100);
  assert.equal(result.sessions, 2);
});

test('课程与章节顺序可持久调整', () => {
  const result = run(`
    const normalized = normalizeWebCourses({
      favorites: [
        { id: 'a', title: 'A', localPath: 'C:\\\\Course\\\\a.mp4', order: 1 },
        { id: 'b', title: 'B', localPath: 'C:\\\\Course\\\\b.mp4', order: 2 },
      ],
    });
    state.webCourses = normalized;
    moveCourseResource('b', -1);
    const courseOrder = orderedCourseLibrary().map((item) => item.id);
    const group = normalizeWebCourses({
      favorites: [{
        id: 'g',
        kind: 'course',
        title: 'G',
        chapters: [
          { id: 'c1', title: '1', localPath: 'C:\\\\Course\\\\1.mp4', order: 1 },
          { id: 'c2', title: '2', localPath: 'C:\\\\Course\\\\2.mp4', order: 2 },
        ],
      }],
    }).favorites[0];
    state.webCourses.favorites.push(group);
    moveCourseChapter('g', 'c2', -1);
    return {
      courseOrder,
      chapterOrder: group.chapters.map((item) => item.id),
    };
  `);
  assert.equal(JSON.stringify(result.courseOrder), JSON.stringify(['b', 'a']));
  assert.equal(JSON.stringify(result.chapterOrder), JSON.stringify(['c2', 'c1']));
});

async function runAsyncTests() {
await testAsync('本地导入失败可返回明确错误且不修改课程库', async () => {
  const result = await runAsync(`
    state.webCourses = normalizeWebCourses({});
    bridge.chooseLocalCourseFiles = async () => ({
      ok: false,
      canceled: false,
      error: '没有可导入的本地课程文件',
      files: [],
      errors: [],
    });
    await importLocalCourseResources();
    return state.webCourses.favorites.length;
  `);
  assert.equal(result, 0);
});

await testAsync('单个本地文件导入后可编辑并保留到状态', async () => {
  const result = await runAsync(`
    state.webCourses = normalizeWebCourses({});
    bridge.chooseLocalCourseFiles = async () => ({
      ok: true,
      canceled: false,
      files: [{
        path: 'C:\\\\Course\\\\lesson01.mp4',
        name: 'lesson01',
        fileName: 'lesson01.mp4',
        size: 1000,
        modifiedAt: Date.now(),
      }],
      errors: [],
    });
    await importLocalCourseResources();
    const course = state.webCourses.favorites[0];
    course.title = 'N5 听力';
    course.category = '听力';
    course.durationMinutes = 18;
    const normalized = normalizeWebCourses(state.webCourses);
    return normalized.favorites[0];
  `);
  assert.equal(result.title, 'N5 听力');
  assert.equal(result.category, '听力');
  assert.equal(result.durationMinutes, 18);
  assert.equal(result.localPath, 'C:\\Course\\lesson01.mp4');
  assert.equal(result.kind, 'lesson');
});

await testAsync('多文件导入形成课程组和章节', async () => {
  const result = await runAsync(`
    state.webCourses = normalizeWebCourses({});
    bridge.chooseLocalCourseFiles = async () => ({
      ok: true,
      canceled: false,
      files: [
        { path: 'C:\\\\Course\\\\01.mp4', name: '01', fileName: '01.mp4', size: 1000 },
        { path: 'C:\\\\Course\\\\02.mp4', name: '02', fileName: '02.mp4', size: 1000 },
      ],
      errors: [],
    });
    await importLocalCourseResources();
    const course = state.webCourses.favorites[0];
    return {
      kind: course.kind,
      chapters: course.chapters.length,
      firstPath: course.chapters[0].localPath,
    };
  `);
  assert.equal(result.kind, 'course');
  assert.equal(result.chapters, 2);
  assert.equal(result.firstPath, 'C:\\Course\\01.mp4');
});

await testAsync('本地文件缺失时提示错误且不会标记开始或完成', async () => {
  const result = await runAsync(`
    state.webCourses = normalizeWebCourses({
      favorites: [{
        id: 'missing-1',
        title: '缺失文件课程',
        localPath: 'D:\\\\Course\\\\missing.mp4',
      }],
    });
    bridge.openLocalCourseFile = async () => ({
      ok: false,
      error: '文件不存在',
    });
    await openCourseResource('missing-1');
    return {
      status: state.webCourses.favorites[0].status,
      sessions: state.webCourses.courseSessions.length,
    };
  `);
  assert.equal(result.status, 'unstarted');
  assert.equal(result.sessions, 0);
});

test('本地文件 IPC 只允许媒体与课程文档扩展名', () => {
  const mainSource = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const preloadSource = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');
  for (const token of [
    "'.mp4'",
    "'.webm'",
    "'.mp3'",
    "'.wav'",
    "'.pdf'",
    'course:choose-local-files',
    'course:open-local',
    'inspectLocalCourseFile',
  ]) {
    assert.ok(mainSource.includes(token), token);
  }
  assert.ok(preloadSource.includes('chooseLocalCourseFiles'));
  assert.ok(preloadSource.includes('openLocalCourseFile'));
});

test('课程管理界面包含导入、编辑、删除、排序和章节入口', () => {
  const markup = run(`
    state.webCourses = normalizeWebCourses({
      favorites: [{
        id: 'local-1',
        title: '本地课程',
        localPath: 'C:\\\\Course\\\\lesson.mp4',
        status: 'unstarted',
      }],
    });
    return renderCourse();
  `);
  for (const action of [
    'course-local-import',
    'course-create',
    'course-resource-open',
    'course-edit',
    'course-delete',
    'course-order',
    'course-chapters',
  ]) {
    assert.ok(markup.includes(`data-action="${action}"`), action);
  }
});

test('课程编辑弹窗包含名称、来源、时长、分类、等级和备注', () => {
  const markup = run(`
    const realOpenModal = openModal;
    let captured = '';
    openModal = (html) => {
      captured = html;
    };
    openCourseEditor();
    openModal = realOpenModal;
    return captured;
  `);
  for (const id of [
    'course-edit-title',
    'course-edit-source',
    'course-edit-duration',
    'course-edit-category',
    'course-edit-level',
    'course-edit-notes',
  ]) {
    assert.ok(markup.includes(`id="${id}"`), id);
  }
});

test('完成会话中的完成标记可跨存档规范化保留', () => {
  const result = run(`
    const normalized = normalizeWebCourses({
      courseSessions: [{
        at: Date.now(),
        courseId: 'c1',
        chapterId: 'ch1',
        title: '第一章',
        localPath: 'C:\\\\Course\\\\01.mp4',
        durationMinutes: 20,
        completed: true,
      }],
    });
    return normalized.courseSessions[0];
  `);
  assert.equal(result.completed, true);
  assert.equal(result.courseId, 'c1');
  assert.equal(result.chapterId, 'ch1');
  assert.equal(result.durationMinutes, 20);
});

test('扫描有误时课程库保持可用', () => {
  const normalized = run(`
    return normalizeWebCourses({
      favorites: [
        { id: 'bad', title: '相对路径', localPath: '../movie.mp4' },
        { id: 'good', title: '有效路径', localPath: 'D:\\\\Course\\\\valid.mp4' },
      ],
      courseSessions: [
        { at: 0, title: '坏记录' },
        { at: Date.now(), title: '有效记录', localPath: 'D:\\\\Course\\\\valid.mp4' },
      ],
    });
  `);
  assert.equal(normalized.favorites.length, 1);
  assert.equal(normalized.favorites[0].localPath, 'D:\\Course\\valid.mp4');
  assert.equal(normalized.courseSessions.length, 1);
});

test('旧计划缺少课程排程字段时保持兼容', () => {
  const result = run(`
    const plan = normalizeStudyPlan({
      configured: true,
      currentLevel: 'zero',
      targetLevel: 'N5',
      durationValue: 3,
      durationUnit: 'months',
      dailyMinutes: 30,
      weeklyStudyDays: 5,
      dailyCourseTarget: 1,
    });
    return {
      configured: plan.coursePlanConfigured,
      start: plan.courseStartDate,
      target: plan.courseTargetDate,
      minutes: plan.courseDailyMinutes,
      intensity: plan.courseIntensity,
    };
  `);
  assert.equal(result.configured, false);
  assert.equal(result.start, '');
  assert.equal(result.target, '');
  assert.equal(result.minutes, 30);
  assert.equal(result.intensity, 'standard');
});

test('课程建议根据目标日期、时长和强度生成可行方案', () => {
  const result = run(`
    const favorites = Array.from({ length: 10 }, (_, index) => ({
      id: 'plan-course-' + index,
      title: '课程 ' + index,
      localPath: 'C:\\\\Course\\\\' + index + '.mp4',
      durationMinutes: 30,
      order: index + 1,
    }));
    state.webCourses = normalizeWebCourses({ favorites });
    const plan = normalizeStudyPlan({
      ...state.studyPlan,
      configured: false,
      coursePlanConfigured: true,
      courseStartDate: todayKey(),
      courseTargetDate: todayKey(30 * DAY_MILLISECONDS),
      courseTargetCount: 8,
      dailyCourseTarget: 2,
      weeklyStudyDays: 5,
      courseDailyMinutes: 60,
      courseIntensity: 'standard',
    });
    return calculateCoursePlanSuggestion(plan);
  `);
  assert.equal(result.ok, true);
  assert.equal(result.totalLessons, 8);
  assert.equal(result.remainingLessons, 8);
  assert.ok(result.suggestedDailyCount >= 1);
  assert.ok(result.suggestedDailyMinutes >= 30);
  assert.ok(result.projectedEnd);
  assert.equal(result.targetFeasible, true);
});

test('不现实的目标日期会给出较晚的预计完成日期', () => {
  const result = run(`
    const favorites = Array.from({ length: 30 }, (_, index) => ({
      id: 'dense-' + index,
      title: '课程 ' + index,
      localPath: 'C:\\\\Course\\\\dense-' + index + '.mp4',
      durationMinutes: 60,
      order: index + 1,
    }));
    state.webCourses = normalizeWebCourses({ favorites });
    const start = todayKey();
    const plan = normalizeStudyPlan({
      ...state.studyPlan,
      coursePlanConfigured: true,
      courseStartDate: start,
      courseTargetDate: coursePlanAddDays(start, 2),
      courseTargetCount: 30,
      dailyCourseTarget: 1,
      weeklyStudyDays: 7,
      courseDailyMinutes: 30,
      courseIntensity: 'standard',
    });
    return calculateCoursePlanSuggestion(plan);
  `);
  assert.equal(result.ok, true);
  assert.equal(result.targetFeasible, false);
  assert.match(result.projectedEnd, /^\d{4}-\d{2}-\d{2}$/);
});

test('排程按照每日节数分配到学习日', () => {
  const result = run(`
    const favorites = Array.from({ length: 6 }, (_, index) => ({
      id: 'scheduled-' + index,
      title: '课程 ' + index,
      localPath: 'C:\\\\Course\\\\scheduled-' + index + '.mp4',
      durationMinutes: 25,
      order: index + 1,
    }));
    state.webCourses = normalizeWebCourses({ favorites });
    const plan = normalizeStudyPlan({
      ...state.studyPlan,
      coursePlanConfigured: true,
      courseStartDate: todayKey(),
      courseTargetDate: coursePlanAddDays(todayKey(), 20),
      courseTargetCount: 5,
      dailyCourseTarget: 2,
      weeklyStudyDays: 5,
      courseDailyMinutes: 60,
      courseIntensity: 'standard',
    });
    state.studyPlan = plan;
    state.webCourses.courseSchedule = buildCoursePlanSchedule(plan, false);
    return courseScheduleEntriesWithState().map((item) => ({
      date: item.date,
      title: item.title,
      completed: item.completed,
    }));
  `);
  assert.equal(result.length, 5);
  const byDate = new Map();
  result.forEach((item) => {
    byDate.set(item.date, (byDate.get(item.date) || 0) + 1);
  });
  assert.ok([...byDate.values()].every((count) => count <= 2));
  assert.ok(byDate.size >= 3);
});

test('重新安排会保留已完成课程并移动逾期未完成课程', () => {
  const result = run(`
    const favorites = Array.from({ length: 3 }, (_, index) => ({
      id: 'retry-' + index,
      title: '课程 ' + index,
      localPath: 'C:\\\\Course\\\\retry-' + index + '.mp4',
      durationMinutes: 20,
      order: index + 1,
    }));
    state.webCourses = normalizeWebCourses({ favorites });
    state.webCourses.favorites[0].status = 'completed';
    state.webCourses.favorites[1].status = 'learning';
    const plan = normalizeStudyPlan({
      ...state.studyPlan,
      coursePlanConfigured: true,
      courseStartDate: todayKey(),
      courseTargetDate: coursePlanAddDays(todayKey(), 10),
      courseTargetCount: 3,
      dailyCourseTarget: 1,
      weeklyStudyDays: 7,
      courseDailyMinutes: 30,
    });
    state.studyPlan = plan;
    state.webCourses.courseSchedule = [
      { id: 's1', date: todayKey(-86400000), courseId: 'retry-0', chapterId: '', order: 1 },
      { id: 's2', date: todayKey(-86400000), courseId: 'retry-1', chapterId: '', order: 2 },
    ];
    state.webCourses.courseSchedule = buildCoursePlanSchedule(plan, false);
    return courseScheduleEntriesWithState().map((item) => ({
      courseId: item.courseId,
      date: item.date,
      completed: item.completed,
    }));
  `);
  assert.equal(result.some((item) => item.courseId === 'retry-1'), true);
  const today = run('return todayKey();');
  assert.ok(
    result.some(
      (item) =>
        item.courseId === 'retry-0' &&
        item.completed &&
        item.date < today,
    ),
  );
  assert.ok(
    result
      .filter((item) => !item.completed)
      .every((item) => item.date >= today),
  );
});

test('课程计划弹窗包含日期、目标数量、每日节数、时长、强度和周学习天数', () => {
  const markup = run(`
    state.webCourses = normalizeWebCourses({
      favorites: [{
        id: 'ui-plan-1',
        title: '计划课程',
        localPath: 'D:\\\\Course\\\\planned.mp4',
        durationMinutes: 30,
      }],
    });
    const realOpenModal = openModal;
    let captured = '';
    openModal = (html) => {
      captured = html;
    };
    openCoursePlanEditor();
    openModal = realOpenModal;
    return captured;
  `);
  for (const id of [
    'course-plan-start',
    'course-plan-target',
    'course-plan-count',
    'course-plan-daily-count',
    'course-plan-minutes',
    'course-plan-weekly-days',
    'course-plan-intensity',
  ]) {
    assert.ok(markup.includes(`id="${id}"`), id);
  }
});

test('已配置计划的网课页展示计划、进度和课程任务', () => {
  const markup = run(`
    state.webCourses = normalizeWebCourses({
      favorites: [{
        id: 'page-plan-1',
        title: '页面课程',
        localPath: 'D:\\\\Course\\\\page.mp4',
        durationMinutes: 20,
      }],
    });
    state.studyPlan = normalizeStudyPlan({
      ...state.studyPlan,
      coursePlanConfigured: true,
      courseStartDate: todayKey(),
      courseTargetDate: coursePlanAddDays(todayKey(), 14),
      courseTargetCount: 1,
      dailyCourseTarget: 1,
      weeklyStudyDays: 5,
      courseDailyMinutes: 30,
      courseIntensity: 'standard',
    });
    state.webCourses.courseSchedule = buildCoursePlanSchedule(state.studyPlan, false);
    return renderCourse();
  `);
  assert.match(markup, /课程学习计划/);
  assert.match(markup, /课程任务|页面课程/);
  assert.match(markup, /重新安排剩余课程/);
  assert.match(markup, /data-action="course-plan-edit"/);
});

test('课程计划字段和排程可完整保存并回读', () => {
  const result = run(`
    const normalized = normalizeState({
      kana: {},
      words: {},
      grammar: {},
      studyPlan: {
        configured: false,
        currentLevel: 'zero',
        targetLevel: 'N5',
        coursePlanConfigured: true,
        courseStartDate: '2026-10-24',
        courseTargetDate: '2026-12-20',
        courseTargetCount: 12,
        dailyCourseTarget: 2,
        weeklyStudyDays: 5,
        courseDailyMinutes: 60,
        courseIntensity: 'focused',
        coursePlanUpdatedAt: Date.now(),
      },
      webCourses: {
        courseSchedule: [
          {
            id: 's1',
            date: '2026-10-24',
            courseId: 'course-1',
            chapterId: 'chapter-1',
            plannedMinutes: 30,
            order: 1,
          },
          {
            id: 's1-duplicate',
            date: '2026-10-24',
            courseId: 'course-1',
            chapterId: 'chapter-1',
            plannedMinutes: 30,
            order: 2,
          },
        ],
      },
    });
    return {
      plan: normalized.studyPlan,
      schedule: normalized.webCourses.courseSchedule,
    };
  `);
  assert.equal(result.plan.coursePlanConfigured, true);
  assert.equal(result.plan.courseTargetDate, '2026-12-20');
  assert.equal(result.plan.courseDailyMinutes, 60);
  assert.equal(result.plan.courseIntensity, 'focused');
  assert.equal(result.schedule.length, 1);
  assert.equal(result.schedule[0].courseId, 'course-1');
});

test('课程库为空时计划建议明确说明缺少信息', () => {
  const result = run(`
    state.webCourses = normalizeWebCourses({});
    return calculateCoursePlanSuggestion(normalizeStudyPlan({
      ...state.studyPlan,
      coursePlanConfigured: true,
      courseStartDate: todayKey(),
      courseTargetDate: coursePlanAddDays(todayKey(), 30),
      courseTargetCount: 1,
      dailyCourseTarget: 1,
      courseDailyMinutes: 30,
    }));
  `);
  assert.equal(result.ok, false);
  assert.match(result.error, /先导入本地课程/);
});

test('课程计划会生成首页今日课程任务且以实际完成记录结算', () => {
  const result = run(`
    state.webCourses = normalizeWebCourses({
      favorites: [{
        id: 'home-course',
        title: '首页课程',
        localPath: 'D:\\\\Course\\\\home.mp4',
        durationMinutes: 30,
      }],
    });
    state.studyPlan = normalizeStudyPlan({
      ...state.studyPlan,
      configured: false,
      coursePlanConfigured: true,
      courseStartDate: todayKey(),
      courseTargetDate: coursePlanAddDays(todayKey(), 14),
      courseTargetCount: 1,
      dailyCourseTarget: 1,
      weeklyStudyDays: 7,
      courseDailyMinutes: 30,
    });
    state.webCourses.courseSchedule = [{
      id: 's1',
      date: todayKey(),
      courseId: 'home-course',
      chapterId: '',
      plannedMinutes: 30,
      order: 1,
    }];
    const before = buildDailyTaskPlan().find((task) => task.id === 'courses');
    setCourseResourceStatus('home-course', '', 'completed');
    const after = buildDailyTaskPlan().find((task) => task.id === 'courses');
    return {
      beforeTarget: before && before.title,
      beforeDone: before && before.done,
      afterDone: after && after.done,
    };
  `);
  assert.equal(result.beforeTarget, '完成 1 节网课');
  assert.equal(result.beforeDone, false);
  assert.equal(result.afterDone, true);
});

test('计划日历显示总体进度、每日任务和已逾期课程', () => {
  const markup = run(`
    state.webCourses = normalizeWebCourses({
      favorites: [
        {
          id: 'calendar-1',
          title: '第一课',
          localPath: 'D:\\\\Course\\\\calendar-1.mp4',
          durationMinutes: 20,
        },
        {
          id: 'calendar-2',
          title: '第二课',
          localPath: 'D:\\\\Course\\\\calendar-2.mp4',
          durationMinutes: 25,
        },
      ],
    });
    state.studyPlan = normalizeStudyPlan({
      ...state.studyPlan,
      coursePlanConfigured: true,
      courseStartDate: coursePlanAddDays(todayKey(), -2),
      courseTargetDate: coursePlanAddDays(todayKey(), 20),
      courseTargetCount: 2,
      dailyCourseTarget: 1,
      weeklyStudyDays: 7,
      courseDailyMinutes: 30,
    });
    state.webCourses.courseSchedule = [
      {
        id: 'old',
        date: coursePlanAddDays(todayKey(), -1),
        courseId: 'calendar-1',
        chapterId: '',
        plannedMinutes: 20,
        order: 1,
      },
      {
        id: 'today',
        date: todayKey(),
        courseId: 'calendar-2',
        chapterId: '',
        plannedMinutes: 25,
        order: 2,
      },
    ];
    ui.courseCalendarMonth = todayKey().slice(0, 7);
    ui.courseCalendarSelectedDate = todayKey();
    const realOpenModal = openModal;
    let captured = '';
    openModal = (html) => {
      captured = html;
    };
    openCoursePlanDashboard();
    openModal = realOpenModal;
    return captured;
  `);
  assert.match(markup, /课程计划日历/);
  assert.match(markup, /总体进度/);
  assert.match(markup, /逾期待补/);
  assert.match(markup, /第二课/);
  assert.match(markup, /course-plan-calendar-select/);
  assert.match(markup, /course-plan-task-complete/);
});

}

runAsyncTests().then(() => {
  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exit(failures.length ? 1 : 0);
});
