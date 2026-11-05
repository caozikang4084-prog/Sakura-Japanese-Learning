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

function loadScript(relativePath) {
  const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  vm.runInContext(source, context, { filename: relativePath });
}

try {
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
    loadScript(file);
  }

  const appSource = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
  const initMarker = '\ninit().catch((error) => {';
  const initIndex = appSource.lastIndexOf(initMarker);
  assert.ok(initIndex > 0, '无法定位 app.js 初始化入口');
  vm.runInContext(appSource.slice(0, initIndex), context, {
    filename: 'src/app.js',
  });
} catch (error) {
  console.error('测试环境初始化失败:', error);
  process.exit(1);
}

const run = (source) => vm.runInContext(`(() => { ${source} })()`, context);

test('内容层 ID 唯一且语法练习引用有效', () => {
  const result = run(`
    const wordIds = new Set(CONTENT_WORDS.map((item) => item.id));
    const grammarIds = new Set(CONTENT_GRAMMAR.map((item) => item.id));
    const questionIds = new Set(CONTENT_GRAMMAR_QUESTIONS.map((item) => item.id));
    const invalidQuestions = CONTENT_GRAMMAR_QUESTIONS
      .filter((item) => !CONTENT_GRAMMAR_BY_ID[item.lessonId])
      .map((item) => item.id);
    return {
      words: CONTENT_WORDS.length,
      grammar: CONTENT_GRAMMAR.length,
      questions: CONTENT_GRAMMAR_QUESTIONS.length,
      wordIds: wordIds.size,
      grammarIds: grammarIds.size,
      questionIds: questionIds.size,
      invalidQuestions,
    };
  `);
  assert.equal(result.wordIds, result.words);
  assert.equal(result.grammarIds, result.grammar);
  assert.equal(result.questionIds, result.questions);
  assert.equal(JSON.stringify(result.invalidQuestions), '[]');
  assert.equal(result.words, 6975);
  assert.equal(result.grammar, 789);
  assert.equal(result.questions, 1009);
});

test('旧存档缺少每周学习天数时兼容为每周 7 天', () => {
  const result = run(`
    return normalizeStudyPlan({
      configured: true,
      currentLevel: 'zero',
      targetLevel: 'N5',
    }).weeklyStudyDays;
  `);
  assert.equal(result, 7);
});

test('每日学习时间覆盖 10—180 分钟并可兼容读取', () => {
  assert.equal(
    JSON.stringify(run('return [...STUDY_DAILY_MINUTES];')),
    JSON.stringify([10, 15, 20, 30, 40, 45, 60, 75, 90, 100, 120, 150, 180]),
  );
  for (const minutes of [10, 20, 45, 60, 90, 120, 150, 180]) {
    assert.equal(
      run(`
        return normalizeStudyPlan({
          configured: true,
          currentLevel: 'zero',
          targetLevel: 'N5',
          dailyMinutes: ${minutes},
        }).dailyMinutes;
      `),
      minutes,
    );
  }
});

test('每周学习 3—7 天会改变剩余学习日和自然日估算', () => {
  const result = run(`
    const now = Date.now();
    const base = {
      configured: true,
      currentLevel: 'N5',
      targetLevel: 'N4',
      durationValue: 2,
      durationUnit: 'months',
      startedAt: now,
      targetDate: now + 60 * DAY_MILLISECONDS,
      dailyMinutes: 30,
      courseDays: [],
    };
    const three = calculateStudyPlanMetrics({ ...base, weeklyStudyDays: 3 });
    const seven = calculateStudyPlanMetrics({ ...base, weeklyStudyDays: 7 });
    return {
      threeDays: three.remainingStudyDays,
      sevenDays: seven.remainingStudyDays,
      threeCalendar: three.estimatedCalendarDays,
      sevenCalendar: seven.estimatedCalendarDays,
    };
  `);
  assert.ok(result.threeDays < result.sevenDays);
  assert.ok(result.threeCalendar >= result.sevenCalendar);
});

const setPlan = (currentLevel, targetLevel, months = 3) =>
  run(`
    state.studyPlan = normalizeStudyPlan({
      configured: true,
      currentLevel: '${currentLevel}',
      targetLevel: '${targetLevel}',
      durationValue: ${months},
      durationUnit: 'months',
      startedAt: Date.now(),
      dailyMinutes: 30,
      weeklyStudyDays: 5,
      courseDays: [],
    });
    state.grammar = {};
  `);

test('零基础到 N5 的语法检测只抽取 N5', () => {
  setPlan('zero', 'N5');
  const levels = run(
    `return selectGrammarQuestions(10, 'plan').map(grammarQuestionLevel);`,
  );
  assert.equal(levels.length, 10);
  assert.ok(levels.every((level) => level === 'N5'));
});

test('N5 到 N4 以 N4 为主并保留 N5 复习', () => {
  setPlan('N5', 'N4');
  const levels = run(
    `return selectGrammarQuestions(10, 'plan').map(grammarQuestionLevel);`,
  );
  assert.equal(levels.filter((level) => level === 'N4').length, 9);
  assert.equal(levels.filter((level) => level === 'N5').length, 1);
});

test('N4 到 N2 按 N3、N2、N4 计划比例抽题', () => {
  setPlan('N4', 'N2', 6);
  const levels = run(
    `return selectGrammarQuestions(10, 'plan').map(grammarQuestionLevel);`,
  );
  assert.equal(levels.filter((level) => level === 'N3').length, 7);
  assert.equal(levels.filter((level) => level === 'N2').length, 2);
  assert.equal(levels.filter((level) => level === 'N4').length, 1);
});

test('全部等级模式仍可跨等级抽题', () => {
  const levels = run(`
    const result = [];
    for (let index = 0; index < 8; index += 1) {
      result.push(
        ...selectGrammarQuestions(10, 'all').map(grammarQuestionLevel),
      );
    }
    return [...new Set(result)];
  `);
  assert.ok(levels.length >= 2);
});

test('综合练习的三道语法题遵循当前计划', () => {
  setPlan('N5', 'N4');
  const levels = run(`
    ui.grammarQuizScope = 'plan';
    return buildQuiz('mixed').questions
      .filter((question) => question.knowledgeType === 'grammar')
      .map((question) => CONTENT_GRAMMAR_BY_ID[question.knowledgeId].level);
  `);
  assert.equal(levels.length, 3);
  assert.ok(levels.every((level) => ['N5', 'N4'].includes(level)));
});

test('“继续下一课”按计划等级顺序推荐', () => {
  setPlan('N5', 'N4');
  const result = run(`
    const first = nextPlannedGrammarLesson();
    state.studyPlan = normalizeStudyPlan({
      configured: true,
      currentLevel: 'N4',
      targetLevel: 'N2',
      durationValue: 6,
      durationUnit: 'months',
      startedAt: Date.now(),
      dailyMinutes: 45,
      weeklyStudyDays: 5,
      courseDays: [],
    });
    CONTENT_GRAMMAR
      .filter((lesson) => lesson.level === 'N3')
      .forEach((lesson) => {
        state.grammar[lesson.id] = { score: 1, total: 1, at: Date.now() };
      });
    const afterN3 = nextPlannedGrammarLesson();
    return { firstLevel: first.level, afterN3Level: afterN3.level };
  `);
  assert.equal(result.firstLevel, 'N4');
  assert.equal(result.afterN3Level, 'N2');
});

test('计划弹窗包含每周天数、扩展时长和实时预览', () => {
  const result = run(`
    const originalOpenModal = openModal;
    let captured = '';
    openModal = (html) => {
      captured = html;
    };
    openStudyPlanEditor();
    openModal = originalOpenModal;
    return captured;
  `);
  assert.match(result, /study-weekly-days/);
  assert.match(result, /study-daily-minutes/);
  assert.match(result, /study-plan-preview/);
  assert.match(result, /120 分钟/);
  assert.match(result, /每周计划学习几天/);
});

test('实时预览会读取基础、目标、期限、时长和每周天数', () => {
  getElement('study-current-level').value = 'N4';
  getElement('study-target-level').value = 'N2';
  getElement('study-duration-value').value = '6';
  getElement('study-duration-unit').value = 'months';
  getElement('study-daily-minutes').value = '120';
  getElement('study-weekly-days').value = '3';
  const result = run(`
    updateStudyPlanPreview();
    return document.getElementById('study-plan-preview').innerHTML;
  `);
  assert.match(result, /目标范围：N3、N2/);
  assert.match(result, /每周 3 天/);
  assert.match(result, /学习日/);
});

test('测验页提供计划范围切换控件', () => {
  setPlan('N5', 'N4');
  const markup = run(`
    state.quizzes = [];
    ui.quiz = null;
    ui.grammarQuizScope = 'plan';
    return renderQuiz();
  `);
  assert.match(markup, /quiz-scope-panel/);
  assert.match(markup, /data-action="quiz-grammar-scope" data-scope="plan"/);
  assert.match(markup, /data-action="quiz-grammar-scope" data-scope="all"/);
});

test('学习计划保存字段可完整规范化回读', () => {
  const result = run(`
    const now = Date.now();
    const plan = normalizeStudyPlan({
      configured: true,
      currentLevel: 'N5',
      targetLevel: 'N1',
      durationValue: 12,
      durationUnit: 'months',
      startedAt: now,
      dailyMinutes: 120,
      weeklyStudyDays: 3,
      courseDays: ['2026-10-23'],
      updatedAt: now,
    });
    return {
      targetLevel: plan.targetLevel,
      dailyMinutes: plan.dailyMinutes,
      weeklyStudyDays: plan.weeklyStudyDays,
      courseDays: plan.courseDays,
    };
  `);
  assert.equal(JSON.stringify(result), JSON.stringify({
    targetLevel: 'N1',
    dailyMinutes: 120,
    weeklyStudyDays: 3,
    courseDays: ['2026-10-23'],
  }));
});

test('旧存档自动补齐每日网课目标和网课会话字段', () => {
  const result = run(`
    const normalized = normalizeState({
      studyPlan: {
        configured: true,
        currentLevel: 'zero',
        targetLevel: 'N5',
      },
      webCourses: {
        favorites: [{
          title: '测试课程',
          url: 'https://www.bilibili.com/video/BV1TEST',
        }],
      },
    });
    return {
      dailyCourseTarget: normalized.studyPlan.dailyCourseTarget,
      courseSessions: normalized.webCourses.courseSessions.length,
      position: normalized.webCourses.favorites[0].lastPositionSeconds,
    };
  `);
  assert.equal(result.dailyCourseTarget, 1);
  assert.equal(result.courseSessions, 0);
  assert.equal(result.position, 0);
});

test('零基础计划从五十音起步并生成至少两轮练习', () => {
  setPlan('zero', 'N5');
  const result = run(`
    state.kana = {};
    state.quizzes = [];
    const metrics = studyPlanMetrics();
    const rounds = practiceRoundPlan(metrics);
    return {
      stage: metrics.stage.title,
      kanaTarget: metrics.kanaDailyTarget,
      groups: metrics.practiceGroups,
      counts: rounds.map((round) => round.count),
      firstMode: rounds[0].mode,
      recommendedRoute: recommendedRoute(),
    };
  `);
  assert.equal(result.stage, '五十音起步');
  assert.equal(result.kanaTarget, 5);
  assert.ok(result.groups >= 2);
  assert.ok(result.counts.every((count) => count >= 6));
  assert.equal(result.firstMode, 'kana');
  assert.equal(result.recommendedRoute, 'kana');
});

test('非零基础每日安排词汇、语法和错题多轮练习', () => {
  setPlan('N5', 'N4');
  const result = run(`
    state.studyPlan = normalizeStudyPlan({
      ...state.studyPlan,
      dailyMinutes: 75,
    });
    state.kana = Object.fromEntries(
      KANA_CELLS.map((cell) => [cell.id, Date.now()]),
    );
    const wrong = {
      type: 'choice',
      prompt: '测试错题',
      correct: '正确答案',
      knowledgeType: 'word',
      knowledgeId: CONTENT_WORDS[0].id,
      knowledgeLabel: CONTENT_WORDS[0].word,
    };
    state.quizzes = [{
      mode: 'words',
      score: 0,
      total: 1,
      at: Date.now(),
      wrongQuestions: [wrong],
      correctKnowledge: [],
    }];
    return practiceRoundPlan().map((round) => round.mode);
  `);
  assert.ok(result.includes('words'));
  assert.ok(result.includes('grammar'));
  assert.ok(result.includes('review'));
});

test('错题在后续任意练习答对后会从错题本移除', () => {
  const result = run(`
    const item = {
      type: 'choice',
      prompt: '测试错题',
      correct: '正确答案',
      knowledgeType: 'word',
      knowledgeId: CONTENT_WORDS[0].id,
      knowledgeLabel: CONTENT_WORDS[0].word,
    };
    state.quizzes = [{
      mode: 'words',
      score: 0,
      total: 1,
      at: Date.now() - 1000,
      wrongQuestions: [item],
    }];
    const before = storedWrongQuestions().length;
    state.quizzes.unshift({
      mode: 'review',
      score: 1,
      total: 1,
      at: Date.now(),
      wrongQuestions: [],
      correctKnowledge: [{
        knowledgeType: item.knowledgeType,
        knowledgeId: item.knowledgeId,
        prompt: item.prompt,
        correct: item.correct,
      }],
    });
    return { before, after: storedWrongQuestions().length };
  `);
  assert.equal(JSON.stringify(result), JSON.stringify({ before: 1, after: 0 }));
});

test('本周任务从五十音推进到 N5 词汇语法并覆盖练习和网课', () => {
  setPlan('zero', 'N5');
  const result = run(`
    state.kana = {};
    state.studyPlan = normalizeStudyPlan({
      ...state.studyPlan,
      weeklyStudyDays: 3,
      dailyCourseTarget: 2,
    });
    state.webCourses.courseSessions = [{
      at: Date.now(),
      title: '今日课程',
      url: 'https://www.bilibili.com/video/BV1TEST',
    }];
    const kanaWeekly = currentWeekTaskProgress();
    state.kana = Object.fromEntries(
      KANA_CELLS.map((cell) => [cell.id, Date.now()]),
    );
    const n5Weekly = currentWeekTaskProgress();
    return {
      kanaTitles: kanaWeekly.tasks.map((task) => task.title),
      n5Titles: n5Weekly.tasks.map((task) => task.title),
      coursesTarget: kanaWeekly.targets.courses,
      courseDone: kanaWeekly.tasks.find((task) => task.id === 'weekly-courses').done,
    };
  `);
  assert.ok(result.kanaTitles.some((title) => title.includes('假名')));
  assert.ok(result.kanaTitles.some((title) => title.includes('练习')));
  assert.ok(result.kanaTitles.some((title) => title.includes('网课')));
  assert.ok(!result.kanaTitles.some((title) => title.includes('词汇')));
  assert.ok(result.n5Titles.some((title) => title.includes('词汇')));
  assert.ok(result.n5Titles.some((title) => title.includes('语法')));
  assert.equal(result.coursesTarget, 6);
  assert.equal(result.courseDone, 1);
});

test('每日网课目标支持 0—5 节并计入今日与本周统计', () => {
  const result = run(`
    const plan = normalizeStudyPlan({
      configured: true,
      currentLevel: 'N5',
      targetLevel: 'N4',
      durationValue: 3,
      durationUnit: 'months',
      dailyMinutes: 45,
      weeklyStudyDays: 5,
      dailyCourseTarget: 4,
    });
    state.studyPlan = plan;
    state.webCourses.courseSessions = [
      { at: Date.now(), title: '第一节', url: '' },
      { at: Date.now() - 1000, title: '第二节', url: '' },
    ];
    const metrics = studyPlanMetrics();
    return {
      target: plan.dailyCourseTarget,
      today: courseSessionCountForDate(todayKey()),
      week: courseSessionCountThisWeek(),
      weeklyTarget: metrics.courseWeeklyTarget,
    };
  `);
  assert.equal(result.target, 4);
  assert.equal(result.today, 2);
  assert.equal(result.week, 2);
  assert.equal(result.weeklyTarget, 20);
});

test('缩短练习仍能按指定题数生成多轮题组', () => {
  const counts = run(`
    return ['kana', 'words', 'grammar', 'mixed'].map(
      (mode) => buildQuiz(mode, 6).questions.length,
    );
  `);
  assert.equal(JSON.stringify(counts), JSON.stringify([6, 6, 6, 6]));
});

test('首页渲染每日任务、每周任务、多轮练习和错题本', () => {
  setPlan('zero', 'N5');
  const markup = run(`
    state.kana = {};
    state.webCourses.courseSessions = [];
    return renderHome();
  `);
  assert.match(markup, /每日任务/);
  assert.match(markup, /本周任务/);
  assert.match(markup, /今天的多轮练习/);
  assert.match(markup, /错题本/);
  assert.match(markup, /五十音起步/);
});

test('计划编辑和网课页均可设置每日网课节数', () => {
  const markup = run(`
    const originalOpenModal = openModal;
    let captured = '';
    openModal = (html) => {
      captured = html;
    };
    openStudyPlanEditor();
    openModal = originalOpenModal;
    return captured;
  `);
  assert.match(markup, /id="study-daily-courses"/);
  const courseSource = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
  assert.match(courseSource, /id="course-daily-target"/);
});

test('网课播放位置 IPC 与渲染端接口已接通', () => {
  const mainSource = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const preloadSource = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');
  const appSource = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
  assert.match(mainSource, /course:capture-position/);
  assert.match(mainSource, /video\.currentTime/);
  assert.match(preloadSource, /captureCoursePosition/);
  assert.match(appSource, /recordCurrentCoursePosition/);
  assert.match(appSource, /lastPositionSeconds/);
});

test('例句词卡可识别词典形和常见活用形', () => {
  const result = run(`
    const taberu = CONTENT_WORDS.find((word) => word.word === '食べる');
    const pan = CONTENT_WORDS.find((word) => word.word === 'パン');
    const matches = exampleWordMatches('私はパンを食べます。', taberu.id);
    return {
      terms: matches.map((match) => match.term),
      ids: matches.map((match) => match.item.id),
      taberuId: taberu.id,
      panId: pan.id,
    };
  `);
  assert.ok(result.terms.includes('食べます'));
  assert.ok(result.terms.includes('パン'));
  assert.ok(result.ids.includes(result.taberuId));
  assert.ok(result.ids.includes(result.panId));
  assert.equal(result.terms.includes('は'), false);
});

test('例句卡片同时展示假名、罗马音和可点击词汇', () => {
  const markup = run(`
    const word = CONTENT_WORDS.find((item) => item.word === '食べる');
    return renderExampleStudyCard(
      {
        ja: '私はパンを食べます。',
        reading: 'わたしはぱんをたべます。',
        zh: '我吃面包。',
      },
      word.id,
    );
  `);
  assert.match(markup, /わたしはぱんをたべます/);
  assert.match(markup, /watashi wa pan o tabemasu\./i);
  assert.match(markup, /class="example-word-link"/);
  assert.match(markup, /data-action="translation-knowledge"/);
  assert.match(markup, /data-context-sentence="私はパンを食べます。"/);
  assert.match(markup, /跟读模仿/);
});

test('缺失假名读音时不会猜测例句罗马音', () => {
  const markup = run(`
    return renderExampleStudyCard({
      ja: '特別な日です。',
      reading: '',
      zh: '是特别的一天。',
    });
  `);
  assert.match(markup, /暂时缺少可靠假名读音/);
  assert.doesNotMatch(markup, /tokubetsunahidesu/i);
});

test('词汇和语法例句均使用统一学习卡片', () => {
  const result = run(`
    const word = CONTENT_WORDS.find(
      (item) => item.examples?.[0]?.reading && item.examples[0].ja,
    );
    ui.wordLevel = 'all';
    ui.wordPos = 'all';
    ui.wordTheme = 'all';
    ui.wordFilter = 'all';
    ui.wordPage = Math.max(1, Math.ceil((word.order || 1) / WORD_PAGE_SIZE));
    ui.selectedWord = word.id;
    const wordMarkup = renderWords();
    const lesson = CONTENT_GRAMMAR.find(
      (item) => item.examples?.[0]?.reading,
    );
    ui.lessonId = lesson.id;
    const grammarMarkup = renderLesson(lesson);
    return {
      wordCards: (wordMarkup.match(/example-study-card/g) || []).length,
      grammarCards: (grammarMarkup.match(/example-study-card/g) || []).length,
      wordHasRomaji: wordMarkup.includes('example-study-romaji'),
      grammarHasRomaji: grammarMarkup.includes('example-study-romaji'),
    };
  `);
  assert.ok(result.wordCards >= 1);
  assert.equal(result.grammarCards >= 1, true);
  assert.equal(result.wordHasRomaji, true);
  assert.equal(result.grammarHasRomaji, true);
});

test('现有词汇与语法例句具有可生成罗马音的假名读音', () => {
  const result = run(`
    const missingWords = [];
    const missingGrammar = [];
    CONTENT_WORDS.forEach((word) => {
      word.examples.forEach((example) => {
        if (!example.reading || !romajiHint(example.ja, example.reading)) {
          missingWords.push(word.id);
        }
      });
    });
    CONTENT_GRAMMAR.forEach((lesson) => {
      lesson.examples.forEach((example) => {
        if (!example.reading || !romajiHint(example.ja, example.reading)) {
          missingGrammar.push(lesson.id);
        }
      });
    });
    return {
      missingWords: [...new Set(missingWords)],
      missingGrammar: [...new Set(missingGrammar)],
    };
  `);
  assert.equal(
    JSON.stringify(result.missingWords),
    '[]',
    `缺少词汇例句读音: ${result.missingWords.slice(0, 20).join(', ')}`,
  );
  assert.equal(
    JSON.stringify(result.missingGrammar),
    '[]',
    `缺少语法例句读音: ${result.missingGrammar.slice(0, 20).join(', ')}`,
  );
});

test('抽样例句保持较高的已收录词汇标记覆盖率', () => {
  const result = run(`
    const sampledWords = CONTENT_WORDS.filter((_word, index) => index % 25 === 0);
    const sampledGrammar = CONTENT_GRAMMAR.filter((_item, index) => index % 10 === 0);
    const wordsTotal = sampledWords.reduce(
      (total, word) => total + word.examples.length,
      0,
    );
    const grammarTotal = sampledGrammar.reduce(
      (total, lesson) => total + lesson.examples.length,
      0,
    );
    const wordsHit = sampledWords.reduce(
      (total, word) =>
        total +
        word.examples.filter(
          (example) => exampleWordMatches(example.ja, word.id).length > 0,
        ).length,
      0,
    );
    const grammarHit = sampledGrammar.reduce(
      (total, lesson) =>
        total +
        lesson.examples.filter(
          (example) => exampleWordMatches(example.ja).length > 0,
        ).length,
      0,
    );
    return {
      wordRate: wordsTotal ? wordsHit / wordsTotal : 0,
      grammarRate: grammarTotal ? grammarHit / grammarTotal : 0,
      wordsTotal,
      grammarTotal,
    };
  `);
  assert.ok(result.wordRate >= 0.7, JSON.stringify(result));
  assert.ok(result.grammarRate >= 0.85, JSON.stringify(result));
  console.log(
    `  sample coverage: words ${(result.wordRate * 100).toFixed(1)}% (${result.wordsTotal} examples), grammar ${(result.grammarRate * 100).toFixed(1)}% (${result.grammarTotal} examples)`,
  );
});

test('中文释义在词汇列表、详情和词卡中保持醒目样式', () => {
  const indexSource = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  const styleSource = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  const appSource = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
  assert.match(indexSource, /class="app-watermark"/);
  assert.match(indexSource, /烟熏雪糕/);
  assert.match(indexSource, /仅限私人用途/);
  assert.match(indexSource, /🍨 \(๑˃̵ᴗ˂̵\)و/);
  assert.match(styleSource, /\.word-meaning\s*\{/);
  assert.match(styleSource, /\.detail-meaning\s*\{/);
  assert.match(styleSource, /\.translation-card-meaning\s*\{/);
  assert.match(appSource, /class="translation-card-meaning"/);
});

test('全局水印固定在右下角且不拦截点击', () => {
  const styleSource = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  const block = styleSource.match(/\.app-watermark\s*\{([\s\S]*?)\}/)?.[1] || '';
  assert.match(block, /position:\s*fixed/);
  assert.match(block, /right:\s*22px/);
  assert.match(block, /bottom:\s*14px/);
  assert.match(block, /pointer-events:\s*none/);
  assert.match(block, /opacity:\s*\.78/);
});

test('翻译记录兼容旧存档并最多保留五十条', () => {
  const result = run(`
    const history = Array.from({ length: 60 }, (_, index) => ({
      at: index + 1,
      direction: index % 2 ? 'zh-ja' : 'ja-zh',
      source: '原文 ' + index,
      text: '译文 ' + index,
      provider: 'test',
    }));
    const normalized = normalizeTranslationHistory(history);
    const oldState = normalizeState({});
    return {
      count: normalized.length,
      newest: normalized[0].source,
      oldest: normalized[normalized.length - 1].source,
      oldDefault: oldState.translationHistory.length,
    };
  `);
  assert.equal(result.count, 50);
  assert.equal(result.newest, '原文 59');
  assert.equal(result.oldest, '原文 10');
  assert.equal(result.oldDefault, 0);
});

test('每日练习轮数和每轮题数支持旧存档兼容与自定义', () => {
  const result = run(`
    const oldPlan = normalizeStudyPlan({});
    state.studyPlan = {
      ...defaultState().studyPlan,
      dailyPracticeGroups: 4,
      practiceQuestionsPerRound: 15,
    };
    const rounds = practiceRoundPlan(null);
    return {
      oldGroups: oldPlan.dailyPracticeGroups,
      oldQuestions: oldPlan.practiceQuestionsPerRound,
      rounds: rounds.length,
      counts: rounds.map((round) => round.count),
    };
  `);
  assert.equal(result.oldGroups, 0);
  assert.equal(result.oldQuestions, 0);
  assert.equal(result.rounds, 4);
  assert.ok(result.counts.every((count) => count === 15));
});

test('自定义二十题练习不会被旧上限截成十题', () => {
  const result = run(`
    const quiz = buildQuiz('kana', 20);
    return { count: quiz.questions.length, limit: MAX_PRACTICE_QUESTION_COUNT };
  `);
  assert.equal(result.limit, 20);
  assert.equal(result.count, 20);
});

test('未完成的练习不会计作当日完成轮次', () => {
  const result = run(`
    state = defaultState();
    ui.quiz = null;
    startQuiz('kana', 5);
    const sessionId = ui.quiz.sessionId;
    ui.quiz.answeredCount = 2;
    updatePracticeSession(sessionId, { answeredCount: 2 });
    exitQuiz();
    const session = state.practiceSessions.find((item) => item.id === sessionId);
    return {
      status: session?.status,
      answeredCount: session?.answeredCount,
      completedToday: practiceCountForDate(todayKey()),
    };
  `);
  assert.equal(result.status, 'abandoned');
  assert.equal(result.answeredCount, 2);
  assert.equal(result.completedToday, 0);
});

test('完成练习会记录计划题数、实际答题数和知识点', () => {
  const result = run(`
    state = defaultState();
    ui.quiz = null;
    startQuiz('words', 5);
    const quiz = ui.quiz;
    quiz.answeredCount = quiz.questions.length;
    quiz.correct = 3;
    quiz.completedAt = Date.now();
    completeCurrentPracticeSession(quiz, quiz.completedAt);
    const session = state.practiceSessions.find((item) => item.id === quiz.sessionId);
    return {
      status: session?.status,
      plannedCount: session?.plannedCount,
      answeredCount: session?.answeredCount,
      questionIds: session?.questionIds.length,
      completedToday: practiceCountForDate(todayKey()),
    };
  `);
  assert.equal(result.status, 'completed');
  assert.equal(result.plannedCount, 5);
  assert.equal(result.answeredCount, 5);
  assert.equal(result.questionIds, 5);
  assert.equal(result.completedToday, 1);
});

test('练习页和计划页提供每日练习目标控件', () => {
  const result = run(`
    state.studyPlan = {
      ...defaultState().studyPlan,
      dailyPracticeGroups: 3,
      practiceQuestionsPerRound: 10,
    };
    ui.quiz = null;
    const quizHtml = renderQuiz();
    return {
      quizGroups: quizHtml.includes('id="practice-daily-groups"'),
      quizQuestions: quizHtml.includes('id="practice-question-count"'),
    };
  `);
  const appSource = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
  assert.equal(result.quizGroups, true);
  assert.equal(result.quizQuestions, true);
  assert.match(appSource, /id="study-daily-practice-groups"/);
  assert.match(appSource, /id="study-practice-question-count"/);
});

test('翻译历史可从页面恢复并显示最近记录', () => {
  const result = run(`
    state.translationHistory = normalizeTranslationHistory([
      { at: 2, direction: 'zh-ja', source: '中文二', text: '日本語二' },
      { at: 1, direction: 'ja-zh', source: '日本語一', text: '中文一' },
    ]);
    const html = renderTranslate();
    return {
      heading: html.includes('最近翻译'),
      historyAction: html.includes('data-action="translation-history-open"'),
      countText: html.includes('2 条'),
    };
  `);
  assert.equal(result.heading, true);
  assert.equal(result.historyAction, true);
  assert.equal(result.countText, true);
});

test('词汇详情卡具有独立滚动区域', () => {
  const styleSource = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  const block = styleSource.match(/\.word-detail\s*\{([\s\S]*?)\}/)?.[1] || '';
  assert.match(block, /max-height:\s*calc\(100vh - 120px\)/);
  assert.match(block, /overflow-y:\s*auto/);
  assert.match(block, /overscroll-behavior:\s*contain/);
});

test('首次安装显示引导，旧存档和读取失败不会强制首次引导', () => {
  const result = run(`
    return {
      fresh: normalizeState(null).onboarding.status,
      legacy: normalizeState({ version: 1 }).onboarding.status,
      readError: normalizeState({ __readError: true }).onboarding.status,
    };
  `);
  assert.equal(
    JSON.stringify(result),
    JSON.stringify({
      fresh: 'pending',
      legacy: 'existing',
      readError: 'existing',
    }),
  );
});

test('首启计划编辑器复用现有字段并提供可跳过的引导', () => {
  const appSource = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
  assert.match(appSource, /function openStudyPlanEditor\(mode = 'edit'\)/);
  assert.match(appSource, /data-action="\$\{onboarding \? 'study-plan-skip' : 'modal-cancel'\}"/);
  assert.match(appSource, /showStartupPlanGuide\(\);/);
  for (const id of [
    'study-current-level',
    'study-target-level',
    'study-daily-minutes',
    'study-weekly-days',
  ]) {
    assert.match(appSource, new RegExp(`id="${id}"`));
  }
});

test('无计划启动显示可关闭引导，已有计划不弹出', () => {
  const result = run(`
    closeModal();
    state = defaultState();
    const planConfigured = state.studyPlan.configured;
    showStartupPlanGuide();
    const onboardingHtml = document.getElementById('modal').innerHTML;
    const onboardingOpen = !document.getElementById('modal-backdrop').hidden;
    closeModal();
    openStudyPlanEditor('onboarding');
    const directOpen = !document.getElementById('modal-backdrop').hidden;
    const directHtml = document.getElementById('modal').innerHTML;
    closeModal();
    state.studyPlan.configured = true;
    showStartupPlanGuide();
    return {
      onboardingOpen,
      directOpen,
      planConfigured,
      hasSkip: directHtml.includes('data-action="study-plan-skip"'),
      hasBase: directHtml.includes('id="study-current-level"'),
      hasTarget: directHtml.includes('id="study-target-level"'),
      hasMinutes: directHtml.includes('id="study-daily-minutes"'),
      hasWeeklyDays: directHtml.includes('id="study-weekly-days"'),
      configuredOpen: !document.getElementById('modal-backdrop').hidden,
    };
  `);
  assert.equal(result.onboardingOpen, true, JSON.stringify(result));
  assert.equal(result.directOpen, true, JSON.stringify(result));
  assert.equal(result.hasSkip, true);
  assert.equal(result.hasBase, true);
  assert.equal(result.hasTarget, true);
  assert.equal(result.hasMinutes, true);
  assert.equal(result.hasWeeklyDays, true);
  assert.equal(result.configuredOpen, false);
});

test('零基础路线从五十音自动衔接 N5，并保留 N4—N1 阶段', () => {
  setPlan('zero', 'N1');
  const result = run(`
    state.kana = {};
    const before = studyPlanMetrics();
    state.kana = Object.fromEntries(
      KANA_CELLS.map((cell) => [cell.id, Date.now()]),
    );
    const after = studyPlanMetrics();
    return {
      beforeStage: before.stage.title,
      beforeRoadmap: before.roadmap.map((item) => item.title),
      afterStage: after.stage.title,
      afterFocus: after.focusLevel,
      afterWordTarget: after.wordTarget,
    };
  `);
  assert.equal(result.beforeStage, '五十音起步');
  assert.equal(
    JSON.stringify(result.beforeRoadmap),
    JSON.stringify([
      '五十音起步',
      'N5 阶段',
      'N4 阶段',
      'N3 阶段',
      'N2 阶段',
      'N1 阶段',
    ]),
  );
  assert.equal(result.afterStage, 'N5 阶段');
  assert.equal(result.afterFocus, 'N5');
  assert.ok(result.afterWordTarget > 0);
});

test('五十音已掌握和 N1 巩固计划均可规范化', () => {
  const result = run(`
    const kanaPlan = normalizeStudyPlan({
      configured: true,
      currentLevel: 'kana',
      targetLevel: 'N5',
      durationValue: 3,
      durationUnit: 'months',
      dailyMinutes: 30,
      weeklyStudyDays: 5,
    });
    const n1Plan = normalizeStudyPlan({
      configured: true,
      currentLevel: 'N1',
      targetLevel: 'N1',
      durationValue: 3,
      durationUnit: 'months',
      dailyMinutes: 60,
      weeklyStudyDays: 5,
    });
    state.studyPlan = kanaPlan;
    state.kana = {};
    const kanaMetrics = studyPlanMetrics();
    const kanaGrammarContext = grammarPlanContext();
    return {
      kanaConfigured: kanaPlan.configured,
      kanaStage: kanaMetrics.stage.title,
      n1Configured: n1Plan.configured,
      kanaReviewLevel: kanaGrammarContext.reviewLevel,
      suggested: {
        kana: suggestedTargetForFoundation('kana'),
        n4: suggestedTargetForFoundation('N4'),
        n1: suggestedTargetForFoundation('N1'),
      },
    };
  `);
  assert.equal(result.kanaConfigured, true);
  assert.equal(result.kanaStage, 'N5 阶段');
  assert.equal(result.n1Configured, true);
  assert.equal(result.kanaReviewLevel, '');
  assert.equal(
    JSON.stringify(result.suggested),
    JSON.stringify({ kana: 'N5', n4: 'N3', n1: 'N1' }),
  );
});

test('每日任务随可用时间调整，跳过引导不修改学习数据和授权字段', () => {
  getElement('study-current-level').value = 'kana';
  getElement('study-target-level').value = 'N4';
  getElement('study-duration-value').value = '3';
  getElement('study-duration-unit').value = 'months';
  getElement('study-daily-minutes').value = '30';
  getElement('study-weekly-days').value = '5';
  getElement('study-daily-practice-groups').value = '0';
  getElement('study-practice-question-count').value = '0';
  getElement('study-daily-courses').value = '0';
  const saved = run(`
    state = normalizeState({
      version: 1,
      words: { w1: Date.now() },
      authorization: { active: true, planIndependent: true },
    });
    const beforeSkipStatus = state.onboarding.status;
    skipStudyPlanOnboarding();
    clearTimeout(saveTimer);
    const skipped = {
      status: state.onboarding.status,
      wordCount: Object.keys(state.words).length,
      authorization: state.authorization,
      configured: state.studyPlan.configured,
    };
    saveStudyPlanFromModal();
    clearTimeout(saveTimer);
    const savedState = normalizeState(JSON.parse(JSON.stringify(state)));
    return {
      beforeSkipStatus,
      skipped,
      status: savedState.onboarding.status,
      authorization: savedState.authorization,
      wordCount: Object.keys(savedState.words).length,
      configured: savedState.studyPlan.configured,
      currentLevel: savedState.studyPlan.currentLevel,
      taskIds: buildDailyTaskPlan(studyPlanMetrics()).map((task) => task.id),
    };
  `);
  assert.equal(saved.beforeSkipStatus, 'existing');
  assert.equal(saved.skipped.status, 'skipped');
  assert.equal(saved.skipped.wordCount, 1);
  assert.equal(saved.skipped.configured, false);
  assert.equal(
    JSON.stringify(saved.skipped.authorization),
    JSON.stringify({ active: true, planIndependent: true }),
  );
  assert.equal(saved.status, 'completed');
  assert.equal(
    JSON.stringify(saved.authorization),
    JSON.stringify({ active: true, planIndependent: true }),
  );
  assert.equal(saved.wordCount, 1);
  assert.equal(saved.configured, true);
  assert.equal(saved.currentLevel, 'kana');
  assert.ok(saved.taskIds.includes('words'));
  assert.ok(saved.taskIds.includes('grammar'));

  const adaptive = run(`
    const build = (minutes) => {
      state.studyPlan = normalizeStudyPlan({
        configured: true,
        currentLevel: 'N5',
        targetLevel: 'N4',
        durationValue: 1,
        durationUnit: 'weeks',
        dailyMinutes: minutes,
        weeklyStudyDays: 5,
      });
      const metrics = studyPlanMetrics();
      return { words: metrics.wordTarget, grammar: metrics.grammarTarget };
    };
    return { short: build(10), long: build(180) };
  `);
  assert.ok(adaptive.long.words > adaptive.short.words);
  assert.ok(adaptive.long.grammar >= adaptive.short.grammar);
});

test('未制定计划时不生成固定个性化每日任务', () => {
  const result = run(`
    state = defaultState();
    return {
      tasks: buildDailyTaskPlan(null).length,
      weekly: currentWeekTaskProgress(null).tasks.length,
    };
  `);
  assert.equal(result.tasks, 0);
  assert.equal(result.weekly, 0);
});

test('到期复习按遗忘风险排序，答对延长间隔，答错重置间隔', () => {
  const result = run(`
    state = defaultState();
    state.studyPlan = normalizeStudyPlan({
      configured: true,
      currentLevel: 'kana',
      targetLevel: 'N5',
      durationValue: 3,
      durationUnit: 'months',
      dailyMinutes: 30,
      weeklyStudyDays: 5,
    });
    const metrics = studyPlanMetrics();
    const word = metrics.focusWordPool[0];
    const grammar = metrics.focusGrammarPool[0];
    const now = Date.now();
    state.words[word.id] = now - 2 * DAY_MILLISECONDS;
    state.grammar[grammar.id] = {
      score: 1,
      total: 1,
      at: now - 2 * DAY_MILLISECONDS,
    };
    const before = collectReviewItems(metrics, { dueOnly: true });
    recordReviewOutcome('word', word.id, true, 'test', now);
    const first = state.reviewSchedule.items[reviewEntryKey('word', word.id)];
    recordReviewOutcome('word', word.id, true, 'test', now + 1000);
    const second = state.reviewSchedule.items[reviewEntryKey('word', word.id)];
    recordReviewOutcome('word', word.id, false, 'test', now + 2000);
    const wrong = state.reviewSchedule.items[reviewEntryKey('word', word.id)];
    return {
      dueKeys: before.map((item) => item.key),
      firstInterval: first.intervalDays,
      secondInterval: second.intervalDays,
      wrongInterval: wrong.intervalDays,
      lapses: wrong.lapses,
      lastResult: wrong.lastResult,
      nextDelay: Math.round((wrong.nextReviewAt - (now + 2000)) / DAY_MILLISECONDS),
    };
  `);
  assert.ok(
    result.dueKeys.includes(`word:${run('return studyPlanMetrics().focusWordPool[0].id;')}`),
  );
  assert.equal(result.firstInterval, 3);
  assert.equal(result.secondInterval, 7);
  assert.equal(result.wrongInterval, 1);
  assert.equal(result.lapses, 1);
  assert.equal(result.lastResult, 'wrong');
  assert.equal(result.nextDelay, 1);
});

test('复习调度兼容旧存档并忽略已取消掌握或无效内容', () => {
  const result = run(`
    const word = CONTENT_WORDS[0];
    const key = reviewEntryKey('word', word.id);
    const now = Date.now();
    const normalized = normalizeState({
      words: { [word.id]: now - 2 * DAY_MILLISECONDS },
      reviewSchedule: {
        items: {
          [key]: {
            type: 'word',
            id: word.id,
            masteredAt: now - 2 * DAY_MILLISECONDS,
            nextReviewAt: now - DAY_MILLISECONDS,
            intervalDays: 1,
          },
          invalid: {
            type: 'word',
            id: 'not-in-content',
            intervalDays: 999,
          },
        },
      },
    });
    state = normalized;
    const dueBefore = collectReviewItems(null, { dueOnly: true }).length;
    delete state.words[word.id];
    const dueAfterCancel = collectReviewItems(null, { dueOnly: true }).length;
    const oldState = normalizeState({ version: 1 });
    return {
      schemaVersion: normalized.reviewSchedule.schemaVersion,
      itemCount: Object.keys(normalized.reviewSchedule.items).length,
      dueBefore,
      dueAfterCancel,
      oldItems: Object.keys(oldState.reviewSchedule.items).length,
    };
  `);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.itemCount, 1);
  assert.equal(result.dueBefore, 1);
  assert.equal(result.dueAfterCancel, 0);
  assert.equal(result.oldItems, 0);
});

test('完成测验会把知识点结果写入间隔复习调度', () => {
  const result = run(`
    state = defaultState();
    state.studyPlan = normalizeStudyPlan({
      configured: true,
      currentLevel: 'kana',
      targetLevel: 'N5',
      durationValue: 3,
      durationUnit: 'months',
      dailyMinutes: 30,
      weeklyStudyDays: 5,
    });
    ui.quiz = null;
    startQuiz('words', 1);
    const quiz = ui.quiz;
    const question = quiz.questions[0];
    state.words[question.knowledgeId] = Date.now();
    quiz.answeredCount = 1;
    quiz.correct = 1;
    finishQuiz();
    const entry =
      state.reviewSchedule.items[
        reviewEntryKey(question.knowledgeType, question.knowledgeId)
      ];
    return {
      intervalDays: entry?.intervalDays,
      lastResult: entry?.lastResult,
      quizMode: state.quizzes[0]?.mode,
    };
  `);
  assert.equal(result.intervalDays, 3);
  assert.equal(result.lastResult, 'correct');
  assert.equal(result.quizMode, 'words');
});

test('从首页或周计划启动复习会进入测验页面', () => {
  const result = run(`
    state = defaultState();
    state.studyPlan = normalizeStudyPlan({
      configured: true,
      currentLevel: 'kana',
      targetLevel: 'N5',
      durationValue: 3,
      durationUnit: 'months',
      dailyMinutes: 30,
      weeklyStudyDays: 5,
    });
    const word = studyPlanMetrics().focusWordPool[0];
    state.words[word.id] = Date.now() - 2 * DAY_MILLISECONDS;
    scheduleInitialReview(
      'word',
      word.id,
      state.words[word.id],
    );
    state.reviewSchedule.items[reviewEntryKey('word', word.id)].nextReviewAt =
      Date.now() - DAY_MILLISECONDS;
    ui.route = 'home';
    ui.quiz = null;
    startQuiz('spaced', 1);
    return {
      route: ui.route,
      hasQuiz: Boolean(ui.quiz),
      questionCount: ui.quiz?.questions.length || 0,
    };
  `);
  assert.equal(result.route, 'quiz');
  assert.equal(result.hasQuiz, true);
  assert.equal(result.questionCount, 1);
});

test('每日任务优先加入到期复习，并使用现有题目且不重复知识点', () => {
  const result = run(`
    state = defaultState();
    state.studyPlan = normalizeStudyPlan({
      configured: true,
      currentLevel: 'kana',
      targetLevel: 'N5',
      durationValue: 3,
      durationUnit: 'months',
      dailyMinutes: 30,
      weeklyStudyDays: 5,
    });
    const metrics = studyPlanMetrics();
    const words = metrics.focusWordPool.slice(0, 2);
    const grammar = metrics.focusGrammarPool[0];
    const now = Date.now();
    words.forEach((word) => {
      state.words[word.id] = now - 2 * DAY_MILLISECONDS;
      scheduleInitialReview('word', word.id, state.words[word.id]);
      state.reviewSchedule.items[reviewEntryKey('word', word.id)].nextReviewAt =
        now - DAY_MILLISECONDS;
    });
    state.grammar[grammar.id] = {
      score: 1,
      total: 1,
      at: now - 2 * DAY_MILLISECONDS,
    };
    scheduleInitialReview('grammar', grammar.id, state.grammar[grammar.id].at);
    state.reviewSchedule.items[reviewEntryKey('grammar', grammar.id)].nextReviewAt =
      now - DAY_MILLISECONDS;
    const refreshed = studyPlanMetrics();
    const tasks = buildDailyTaskPlan(refreshed);
    const quiz = buildQuiz('spaced', 5);
    return {
      firstTask: tasks[0]?.id,
      reviewTitle: tasks[0]?.title,
      reviewCount: tasks[0]?.count,
      questionCount: quiz.questions.length,
      uniqueKnowledge: new Set(
        quiz.questions.map((question) =>
          reviewEntryKey(question.knowledgeType, question.knowledgeId),
        ),
      ).size,
      contentIdsValid: quiz.questions.every((question) =>
        [
          CONTENT_WORD_BY_ID[question.knowledgeId],
          CONTENT_GRAMMAR_BY_ID[question.knowledgeId],
          KANA_BY_ID[question.knowledgeId],
        ].some(Boolean),
      ),
    };
  `);
  assert.equal(result.firstTask, 'review');
  assert.match(result.reviewTitle, /优先完成 3 个间隔复习/);
  assert.equal(result.reviewCount, 3);
  assert.equal(result.questionCount, 3);
  assert.equal(result.uniqueKnowledge, 3);
  assert.equal(result.contentIdsValid, true);
});

test('阶段进度达到一半后安排阶段测试，题目只来自当前阶段', () => {
  const result = run(`
    state = defaultState();
    state.studyPlan = normalizeStudyPlan({
      configured: true,
      currentLevel: 'kana',
      targetLevel: 'N5',
      durationValue: 3,
      durationUnit: 'months',
      dailyMinutes: 60,
      weeklyStudyDays: 5,
    });
    const initial = studyPlanMetrics();
    const wordCount = Math.ceil(initial.focusWordPool.length / 2);
    const grammarCount = Math.ceil(initial.focusGrammarPool.length / 2);
    initial.focusWordPool.slice(0, wordCount).forEach((word) => {
      state.words[word.id] = Date.now();
    });
    initial.focusGrammarPool.slice(0, grammarCount).forEach((lesson) => {
      state.grammar[lesson.id] = { score: 1, total: 1, at: Date.now() };
    });
    const metrics = studyPlanMetrics();
    const quiz = buildQuiz('stage-test', 10);
    const tasks = buildDailyTaskPlan(metrics);
    const weeklyStageTest = currentWeekTaskProgress(metrics).tasks.find(
      (item) => item.id === 'weekly-stage-test',
    );
    const levels = quiz.questions.map((question) =>
      reviewContentLevel(question.knowledgeType, question.knowledgeId),
    );
    return {
      ready: metrics.stageTest.ready,
      due: metrics.stageTest.due,
      task: tasks.find((item) => item.id === 'stage-test')?.title,
      weeklyTask: weeklyStageTest?.title,
      weeklyTarget: weeklyStageTest?.target,
      stageLevel: quiz.stageLevel,
      questionCount: quiz.questions.length,
      levels,
      uniqueKnowledge: new Set(
        quiz.questions.map((question) =>
          reviewEntryKey(question.knowledgeType, question.knowledgeId),
        ),
      ).size,
      homeShowsReview: renderHome().includes('间隔复习'),
      homeShowsStageTest: renderHome().includes('data-mode="stage-test"'),
    };
  `);
  assert.equal(result.ready, true);
  assert.equal(result.due, true);
  assert.match(result.task, /测试/);
  assert.match(result.weeklyTask, /阶段测试/);
  assert.equal(result.weeklyTarget, 1);
  assert.equal(result.stageLevel, 'N5');
  assert.equal(result.questionCount, 10);
  assert.ok(result.levels.every((level) => level === 'N5'));
  assert.equal(result.uniqueKnowledge, 10);
  assert.equal(result.homeShowsReview, true);
  assert.equal(result.homeShowsStageTest, true);
});

test('阶段测试失手会降低新知识量并优先后续复习', () => {
  const result = run(`
    state = defaultState();
    state.studyPlan = normalizeStudyPlan({
      configured: true,
      currentLevel: 'kana',
      targetLevel: 'N5',
      durationValue: 3,
      durationUnit: 'months',
      dailyMinutes: 60,
      weeklyStudyDays: 5,
    });
    const initial = studyPlanMetrics();
    initial.focusWordPool.slice(0, Math.ceil(initial.focusWordPool.length / 2))
      .forEach((word) => {
        state.words[word.id] = Date.now();
      });
    initial.focusGrammarPool.slice(0, Math.ceil(initial.focusGrammarPool.length / 2))
      .forEach((lesson) => {
        state.grammar[lesson.id] = { score: 1, total: 1, at: Date.now() };
      });
    state.quizzes = [{
      id: 'stage-fail',
      mode: 'stage-test',
      stageLevel: 'N5',
      score: 5,
      total: 10,
      at: Date.now(),
      wrongQuestions: [],
      correctKnowledge: [],
    }];
    const adjusted = studyPlanMetrics();
    return {
      behind: adjusted.paceAdjustment.behind,
      needsReview: adjusted.paceAdjustment.stageTestNeedsReview,
      message: adjusted.paceAdjustment.message,
      wordTarget: adjusted.wordTarget,
      grammarTarget: adjusted.grammarTarget,
    };
  `);
  assert.equal(result.behind, true);
  assert.equal(result.needsReview, true);
  assert.match(result.message, /减少新知识/);
  assert.ok(result.wordTarget >= 0);
  assert.ok(result.grammarTarget >= 0);
});

test('未掌握内容优先，已掌握且未到期内容不会重复进入普通词汇抽题', () => {
  const result = run(`
    state = defaultState();
    state.studyPlan = normalizeStudyPlan({
      configured: true,
      currentLevel: 'kana',
      targetLevel: 'N5',
      durationValue: 3,
      durationUnit: 'months',
      dailyMinutes: 30,
      weeklyStudyDays: 5,
    });
    const metrics = studyPlanMetrics();
    const mastered = metrics.focusWordPool[0];
    state.words[mastered.id] = Date.now();
    scheduleInitialReview('word', mastered.id, state.words[mastered.id]);
    state.reviewSchedule.items[reviewEntryKey('word', mastered.id)].nextReviewAt =
      Date.now() + 7 * DAY_MILLISECONDS;
    const before = buildDailyTaskPlan(metrics).length;
    state.practiceSessions = Array.from({ length: 30 }, (_, index) => ({
      id: 'old-abandoned-' + index,
      startedAt: Date.now() - 30 * DAY_MILLISECONDS - index,
      status: 'abandoned',
      plannedCount: 10,
      answeredCount: 1,
      score: 0,
    }));
    const after = buildDailyTaskPlan(studyPlanMetrics()).length;
    const quiz = buildQuiz('words', 5);
    const mixedQuiz = buildQuiz('mixed', 10);
    return {
      before,
      after,
      repeatedMastered: quiz.questions.some(
        (question) => question.knowledgeId === mastered.id,
      ),
      mixedHasKana: mixedQuiz.questions.some(
        (question) => question.knowledgeType === 'kana',
      ),
    };
  `);
  assert.equal(result.before, result.after);
  assert.equal(result.repeatedMastered, false);
  assert.equal(result.mixedHasKana, false);
});

test('重置学习进度会清空复习调度，但保留独立授权字段', () => {
  const result = run(`
    const wordId = CONTENT_WORDS[0].id;
    state = normalizeState({
      authorization: { active: true, planIndependent: true },
      license: { key: 'test-license' },
      words: { [wordId]: Date.now() },
      reviewSchedule: {
        schemaVersion: 1,
        items: {
          ['word:' + wordId]: {
            type: 'word',
            id: wordId,
            intervalDays: 3,
          },
        },
      },
    });
    const beforeReviewItems = Object.keys(state.reviewSchedule.items).length;
    confirmReset();
    clearTimeout(saveTimer);
    return {
      authorization: state.authorization,
      license: state.license,
      beforeReviewItems,
      reviewItems: Object.keys(state.reviewSchedule.items).length,
      words: Object.keys(state.words).length,
      planConfigured: state.studyPlan.configured,
    };
  `);
  assert.equal(
    JSON.stringify(result.authorization),
    JSON.stringify({ active: true, planIndependent: true }),
  );
  assert.equal(JSON.stringify(result.license), JSON.stringify({ key: 'test-license' }));
  assert.equal(result.beforeReviewItems, 1);
  assert.equal(result.reviewItems, 0);
  assert.equal(result.words, 0);
  assert.equal(result.planConfigured, false);
});




console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
