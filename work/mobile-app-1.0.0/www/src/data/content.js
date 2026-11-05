// Normalized content layer.
//
// WORDS and GRAMMAR remain the authored source files for now. This layer adds
// the shared fields that new content should use, without changing existing
// IDs or the learning-state format.
//
// Canonical shared fields:
//   schemaVersion, id, type, level, order, tags, title, examples, exercises
//   canonicalId and aliases are optional word-relation fields.
//
// Word items keep word/kana/meaning/pos. Grammar items keep
// structure/explanation/usage/notes. The old example/exampleZh and questions
// aliases are retained until the UI has fully moved to examples/exercises.

const CONTENT_SCHEMA_VERSION = 1;
const CONTENT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1', '待核验'];
const CONTENT_LEVEL_SOURCES = ['教材', '备考资料', '项目原有标注', '待核验'];
const CONTENT_VERIFICATION_STATUSES = ['已核验', '待核验', '未通过'];

// Confirmed spelling variants remain aliases of the existing canonical word.
// They improve search without creating duplicate learning records or progress keys.
const WORD_ALIASES_BY_ID = {
  w162: ['朝ごはん'],
  w242: ['あいまい'],
  w280: ['いす'],
  w616: ['お祖父さん'],
  w655: ['煩い'],
  w898: ['うれしい'],
};

const WORD_THEME_BY_CATEGORY = {
  人物与称谓: '人物与家庭',
  场所与出行: '场所与方位',
  国家与地名: '国家与地点',
  时间与日期: '时间与日期',
  饮食: '饮食',
  物品与动物: '物品与动物',
  日常动作: '日常动作',
  性质与状态: '性质与状态',
  寒暄与交际: '交流与寒暄',
  兴趣与媒体: '兴趣与媒体',
  学习与工作: '学习与工作',
  程度与频率: '程度与频率',
  天气与自然: '天气与自然',
  疑问表达: '疑问与交流',
  数字: '数字与数量',
  星期与日期: '时间与日期',
  购物: '购物',
  交通: '交通出行',
  方位: '场所与方位',
};

const WORD_EXTRA_THEMES_BY_ID = {
  w01: ['家庭', '学校与学习'],
  w02: ['学校与学习', '人物与家庭'],
  w03: ['学校与学习', '工作'],
  w04: ['日常交流'],
  w05: ['学校与学习', '交通出行'],
  w06: ['旅行'],
  w07: ['旅行'],
  w08: ['日常生活'],
  w09: ['日常生活'],
  w10: ['日常生活'],
  w11: ['日常生活'],
  w12: ['日常生活'],
  w13: ['日常生活'],
  w14: ['日常生活'],
  w15: ['日常生活'],
  w19: ['日常生活'],
  w20: ['日常生活'],
  w21: ['旅行', '交通出行'],
  w22: ['日常生活'],
  w23: ['兴趣与媒体'],
  w24: ['兴趣与媒体'],
  w25: ['交流与寒暄'],
  w26: ['学校与学习'],
  w27: ['学校与学习'],
  w28: ['购物'],
  w47: ['兴趣与媒体'],
  w48: ['兴趣与媒体'],
  w49: ['兴趣与媒体'],
  w50: ['兴趣与媒体'],
  w52: ['交通出行', '场所与方位'],
  w53: ['交通出行', '场所与方位'],
  w54: ['家庭', '场所与方位'],
  w55: ['家庭', '场所与方位'],
  w56: ['学校与学习'],
  w57: ['工作'],
  w58: ['日常生活'],
  w61: ['人物与家庭'],
  w62: ['家庭'],
  w63: ['家庭', '人物与家庭'],
  w64: ['家庭', '人物与家庭'],
  w65: ['家庭', '人物与家庭'],
  w66: ['时间与日期'],
  w67: ['时间与日期'],
  w68: ['时间与日期'],
  w69: ['时间与日期'],
  w70: ['时间与日期'],
  w71: ['日常生活'],
  w72: ['日常生活'],
  w73: ['日常生活'],
  w74: ['日常生活'],
  w75: ['日常生活'],
  w76: ['场所与方位'],
  w77: ['场所与方位'],
  w78: ['日常生活'],
  w79: ['家庭', '日常生活'],
  w80: ['交流与寒暄'],
  w81: ['交流与寒暄'],
  w82: ['交流与寒暄'],
  w83: ['交流与寒暄'],
  w84: ['交流与寒暄'],
  w85: ['日常生活'],
  w86: ['交流与寒暄'],
  w87: ['日常生活'],
  w88: ['时间与日期'],
  w89: ['数字与数量'],
  w90: ['数字与数量', '时间与日期'],
  w91: ['数字与数量', '时间与日期'],
  w92: ['数字与数量'],
  w93: ['数字与数量', '时间与日期'],
  w94: ['数字与数量', '时间与日期'],
  w95: ['数字与数量', '时间与日期'],
  w96: ['数字与数量', '时间与日期'],
  w97: ['数字与数量', '时间与日期'],
  w98: ['数字与数量', '时间与日期'],
  w99: ['时间与日期', '学校与学习'],
  w100: ['时间与日期', '兴趣与媒体'],
  w101: ['时间与日期', '日常交流'],
  w102: ['时间与日期', '工作'],
  w103: ['时间与日期', '购物'],
  w104: ['时间与日期', '家庭'],
  w105: ['饮食'],
  w106: ['饮食', '购物'],
  w107: ['饮食'],
  w108: ['饮食'],
  w109: ['饮食', '购物'],
  w110: ['购物'],
  w111: ['购物'],
  w112: ['购物'],
  w113: ['购物', '数字与数量'],
  w114: ['购物', '交通出行'],
  w115: ['交通出行'],
  w116: ['交通出行'],
  w117: ['交通出行', '旅行'],
  w118: ['场所与方位'],
  w119: ['场所与方位'],
  w120: ['场所与方位'],
  w121: ['学校与学习', '场所与方位'],
};

const GRAMMAR_FUNCTIONS_BY_ID = {
  g01: ['主题提示', '助词'],
  g02: ['判断句', '基础句型'],
  g03: ['疑问', '句末语气'],
  g04: ['所属', '名词连接'],
  g05: ['宾语', '格关系'],
  g06: ['时间', '格关系'],
  g07: ['地点', '格关系'],
  g08: ['方向', '格关系'],
  g09: ['时态', '礼貌体', '动词变化'],
  g10: ['否定', '礼貌体', '动词变化'],
  g11: ['时态', '过去', '动词变化'],
  g12: ['描述', '形容词'],
  g13: ['描述', '形容词'],
  g14: ['指代', '指示词'],
  g15: ['指代', '指示词'],
  g16: ['地点', '指代', '指示词'],
  g17: ['存在', '存在句'],
  g18: ['主语', '格关系', '助词'],
  g19: ['添加', '助词'],
  g20: ['并列', '助词'],
  g21: ['起点终点', '格关系', '助词'],
};

const WORD_CATEGORY_BY_ID = {
  w01: '人物与称谓', w02: '人物与称谓', w03: '人物与称谓', w04: '人物与称谓',
  w05: '场所与出行',
  w06: '国家与地名', w07: '国家与地名',
  w08: '时间与日期', w09: '时间与日期', w10: '时间与日期', w11: '时间与日期', w12: '时间与日期',
  w13: '饮食', w14: '饮食', w15: '饮食',
  w16: '物品与动物', w17: '物品与动物', w18: '物品与动物',
  w19: '日常动作', w20: '日常动作', w21: '日常动作', w22: '日常动作', w23: '日常动作',
  w24: '日常动作', w25: '日常动作', w26: '日常动作', w27: '日常动作', w28: '日常动作',
  w29: '性质与状态', w30: '性质与状态', w31: '性质与状态', w32: '性质与状态',
  w33: '性质与状态', w34: '性质与状态', w35: '性质与状态', w36: '性质与状态',
  w37: '性质与状态', w38: '性质与状态', w39: '性质与状态', w40: '性质与状态',
  w41: '性质与状态', w42: '性质与状态',
  w43: '寒暄与交际', w44: '寒暄与交际', w45: '寒暄与交际', w46: '寒暄与交际',
  w47: '兴趣与媒体', w48: '兴趣与媒体', w49: '兴趣与媒体', w50: '兴趣与媒体',
  w51: '时间与日期',
  w52: '场所与出行', w53: '场所与出行', w54: '场所与出行', w55: '场所与出行',
  w56: '学习与工作', w57: '学习与工作',
  w58: '时间与日期',
  w59: '程度与频率', w60: '程度与频率',
  w61: '人物与称谓', w62: '人物与称谓', w63: '人物与称谓', w64: '人物与称谓', w65: '人物与称谓',
  w66: '时间与日期', w67: '时间与日期', w68: '时间与日期', w69: '时间与日期', w70: '时间与日期',
  w71: '天气与自然', w72: '天气与自然', w73: '天气与自然',
  w74: '性质与状态', w75: '性质与状态', w76: '性质与状态', w77: '性质与状态',
  w78: '性质与状态', w79: '性质与状态',
  w80: '疑问表达', w81: '疑问表达', w82: '疑问表达', w83: '疑问表达', w84: '疑问表达',
  w85: '程度与频率', w86: '程度与频率', w87: '程度与频率', w88: '程度与频率',
};

const GRAMMAR_CATEGORY_BY_ID = {
  g01: '助词', g02: '基础句型', g03: '助词', g04: '助词',
  g05: '助词', g06: '助词', g07: '助词', g08: '助词',
  g09: '动词变化', g10: '动词变化', g11: '动词变化',
  g12: '形容词变化', g13: '形容词变化',
  g14: '指示词', g15: '指示词', g16: '指示词', g17: '存在句',
};

function contentCategory(item, fallbackMap) {
  return item.category || fallbackMap[item.id] || '未分类';
}

function contentLevel(item) {
  return CONTENT_LEVELS.includes(item.level) ? item.level : '待核验';
}

function contentLevelSource(item) {
  return CONTENT_LEVEL_SOURCES.includes(item.levelSource)
    ? item.levelSource
    : item.level
      ? '项目原有标注'
      : '待核验';
}

function contentVerificationStatus(item) {
  return CONTENT_VERIFICATION_STATUSES.includes(item.verificationStatus)
    ? item.verificationStatus
    : '待核验';
}

function contentWordThemes(word, category) {
  const themes = [
    WORD_THEME_BY_CATEGORY[category] || category,
    ...(Array.isArray(word.themes) ? word.themes : []),
    ...(WORD_EXTRA_THEMES_BY_ID[word.id] || []),
  ];
  return [...new Set(themes.filter(Boolean))];
}

function contentGrammarFunctions(lesson) {
  const functions =
    Array.isArray(lesson.functions) && lesson.functions.length
      ? lesson.functions
      : GRAMMAR_FUNCTIONS_BY_ID[lesson.id] || [lesson.category || '未分类'];
  return [...new Set(functions.filter(Boolean))];
}

function contentRomaji(kana) {
  if (typeof romanizeJapanese !== 'function') return '';
  const result = romanizeJapanese(kana, kana);
  return result.ok ? result.romaji : '';
}

function contentDirectory(level, type, pos, category) {
  return [level, type === 'word' ? '词汇' : '语法', pos, category]
    .filter(Boolean)
    .join('/');
}

function contentAudioFile(text) {
  return typeof AUDIO_MANIFEST !== 'undefined' && AUDIO_MANIFEST
    ? AUDIO_MANIFEST[text] || null
    : null;
}

function contentExamples(items, fallbackJa = '', fallbackZh = '', fallbackReading = '') {
  const source = Array.isArray(items) && items.length
    ? items
    : [{ ja: fallbackJa, zh: fallbackZh, reading: fallbackReading }];
  return source.map((example) => ({
    ja: String(example.ja || ''),
    zh: String(example.zh || ''),
    reading: String(example.reading || ''),
    audio: contentAudioFile(example.ja),
  }));
}

function contentExercise(question) {
  const exercise = {
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    explanation: question.explanation,
  };
  if (question.type === 'choice') {
    exercise.options = Array.isArray(question.options) ? [...question.options] : [];
    exercise.answer = question.answer;
  } else {
    exercise.answers = Array.isArray(question.answers) ? [...question.answers] : [];
  }
  return exercise;
}

const CONTENT_WORDS = WORDS.map((word, index) => {
  const exampleReading =
    word.exampleReading ||
    (typeof WORD_EXAMPLE_READING_BY_ID !== 'undefined'
      ? WORD_EXAMPLE_READING_BY_ID[word.id]
      : '');
  const examples = contentExamples(
    word.examples,
    word.example,
    word.exampleZh,
    exampleReading,
  );
  const exercises = Array.isArray(word.exercises)
    ? word.exercises.map(contentExercise)
    : [];
  const level = contentLevel(word);
  const levelSource = contentLevelSource(word);
  const verificationStatus = contentVerificationStatus(word);
  const category = contentCategory(word, WORD_CATEGORY_BY_ID);
  const themes = contentWordThemes(word, category);
  const romaji = contentRomaji(word.kana);
  const directory = word.directory || contentDirectory(level, 'word', word.pos, category);
  const aliases = [
    ...new Set([
      ...(Array.isArray(word.aliases)
        ? word.aliases.map((alias) => String(alias).trim())
        : []),
      ...(WORD_ALIASES_BY_ID[word.id] || []),
    ].filter(Boolean)),
  ];
  const canonicalId = word.canonicalId || word.id;
  return {
    schemaVersion: word.schemaVersion || CONTENT_SCHEMA_VERSION,
    id: word.id,
    type: word.type || 'word',
    level,
    levelSource,
    verificationStatus,
    order: word.order || index + 1,
    tags: Array.isArray(word.tags) && word.tags.length
      ? word.tags
      : [word.pos, level, ...themes].filter(Boolean),
    title: word.title || word.word,
    examples,
    exercises,
    category,
    themes,
    directory,
    word: word.word,
    kana: word.kana,
    romaji,
    canonicalId,
    aliases,
    meaning: word.meaning,
    pos: word.pos,
    searchText: `${word.word} ${word.kana} ${romaji} ${word.meaning} ${word.pos} ${level} ${category} ${themes.join(' ')} ${aliases.join(' ')} ${directory}`
      .toLowerCase(),
    audio: {
      word: contentAudioFile(word.kana),
      examples: examples.map((example) => example.audio).filter(Boolean),
    },
    // Compatibility aliases for the current renderer.
    example: examples[0]?.ja || '',
    exampleZh: examples[0]?.zh || '',
  };
});

const CONTENT_GRAMMAR = GRAMMAR.map((lesson, index) => {
  const examples = contentExamples(lesson.examples);
  const exerciseSource = Array.isArray(lesson.exercises) ? lesson.exercises : lesson.questions || [];
  const exercises = exerciseSource.map(contentExercise);
  const level = contentLevel(lesson);
  const levelSource = contentLevelSource(lesson);
  const verificationStatus = contentVerificationStatus(lesson);
  const category = contentCategory(lesson, GRAMMAR_CATEGORY_BY_ID);
  const functions = contentGrammarFunctions({ ...lesson, category });
  const directory = lesson.directory || contentDirectory(level, 'grammar', '', category);
  return {
    schemaVersion: lesson.schemaVersion || CONTENT_SCHEMA_VERSION,
    id: lesson.id,
    type: lesson.type || 'grammar',
    level,
    levelSource,
    verificationStatus,
    order: lesson.order || index + 1,
    tags: Array.isArray(lesson.tags) && lesson.tags.length
      ? lesson.tags
      : [level, 'grammar', ...functions].filter(Boolean),
    title: lesson.title,
    examples,
    exercises,
    category,
    functions,
    directory,
    structure: lesson.structure,
    explanation: lesson.explanation,
    usage: lesson.usage,
    notes: lesson.notes,
    audio: {
      examples: examples.map((example) => example.audio).filter(Boolean),
    },
    // Compatibility alias for the current renderer.
    questions: exercises,
  };
});

const CONTENT_ITEMS = [...CONTENT_WORDS, ...CONTENT_GRAMMAR];
const CONTENT_BY_ID = Object.fromEntries(CONTENT_ITEMS.map((item) => [item.id, item]));
const CONTENT_WORD_BY_ID = Object.fromEntries(CONTENT_WORDS.map((item) => [item.id, item]));
const CONTENT_GRAMMAR_BY_ID = Object.fromEntries(
  CONTENT_GRAMMAR.map((item) => [item.id, item]),
);
const CONTENT_QUESTION_BY_ID = Object.fromEntries(
  CONTENT_GRAMMAR.flatMap((lesson) =>
    lesson.exercises.map((exercise) => [
      exercise.id,
      { ...exercise, lessonId: lesson.id, lessonTitle: lesson.title },
    ]),
  ),
);
const CONTENT_GRAMMAR_QUESTIONS = CONTENT_GRAMMAR.flatMap((lesson) =>
  lesson.exercises.map((exercise) => ({
    ...exercise,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
  })),
);
const CONTENT_WORD_POS = [...new Set(CONTENT_WORDS.map((item) => item.pos))];
const CONTENT_WORD_THEMES = [
  ...new Set(CONTENT_WORDS.flatMap((item) => item.themes)),
];
const CONTENT_GRAMMAR_FUNCTIONS = [
  ...new Set(CONTENT_GRAMMAR.flatMap((item) => item.functions)),
];
const CONTENT_LEVEL_COUNTS = {
  words: Object.fromEntries(
    CONTENT_LEVELS.map((level) => [
      level,
      CONTENT_WORDS.filter((item) => item.level === level).length,
    ]),
  ),
  grammar: Object.fromEntries(
    CONTENT_LEVELS.map((level) => [
      level,
      CONTENT_GRAMMAR.filter((item) => item.level === level).length,
    ]),
  ),
};
const CONTENT_VERIFICATION_COUNTS = {
  words: Object.fromEntries(
    CONTENT_VERIFICATION_STATUSES.map((status) => [
      status,
      CONTENT_WORDS.filter((item) => item.verificationStatus === status).length,
    ]),
  ),
  grammar: Object.fromEntries(
    CONTENT_VERIFICATION_STATUSES.map((status) => [
      status,
      CONTENT_GRAMMAR.filter((item) => item.verificationStatus === status).length,
    ]),
  ),
};
const CONTENT_DIRECTORY = CONTENT_ITEMS.reduce((groups, item) => {
  (groups[item.directory] ||= []).push(item.id);
  return groups;
}, {});
const CONTENT_STATS = {
  words: CONTENT_WORDS.length,
  grammar: CONTENT_GRAMMAR.length,
  grammarQuestions: CONTENT_GRAMMAR_QUESTIONS.length,
  categories: Object.keys(CONTENT_DIRECTORY).length,
  wordThemes: CONTENT_WORD_THEMES.length,
  grammarFunctions: CONTENT_GRAMMAR_FUNCTIONS.length,
  levels: CONTENT_LEVEL_COUNTS,
  verification: CONTENT_VERIFICATION_COUNTS,
};
