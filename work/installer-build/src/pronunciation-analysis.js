// Pronunciation analysis extension point.
//
// Text match and pronunciation assessment are intentionally separate.
// Future local analyzers can register one or more dimensions without changing
// the recorder, Vosk bridge, content schema, or saved learning-state format.

const PRONUNCIATION_FEATURE_SCHEMA_VERSION = 1;
const PRONUNCIATION_DIMENSIONS = Object.freeze([
  'phonemes',
  'longVowels',
  'gemination',
  'voicing',
  'pitch',
]);
const PRONUNCIATION_DIMENSION_LABELS = Object.freeze({
  phonemes: '音素',
  longVowels: '长音',
  gemination: '促音',
  voicing: '清浊音',
  pitch: '音高',
});
const pronunciationAnalyzers = new Map();

function emptyPronunciationDimensions() {
  return Object.fromEntries(
    PRONUNCIATION_DIMENSIONS.map((name) => [
      name,
      {
        status: 'not-implemented',
        score: null,
        details: null,
      },
    ]),
  );
}

function registerPronunciationAnalyzer(id, analyzer) {
  if (typeof id !== 'string' || !id.trim() || typeof analyzer !== 'function') {
    throw new Error('发音分析器注册参数无效');
  }
  pronunciationAnalyzers.set(id, analyzer);
  return () => pronunciationAnalyzers.delete(id);
}

async function analyzePronunciationFeatures(input = {}) {
  const dimensions = emptyPronunciationDimensions();
  const failures = [];
  let acoustic = null;
  let moraAlignment = null;
  const analyzers = Array.from(pronunciationAnalyzers.entries());
  const results = await Promise.allSettled(
    analyzers.map(async ([id, analyzer]) => ({
      id,
      result: await analyzer(input),
    })),
  );

  results.forEach((outcome, index) => {
    const id = analyzers[index][0];
    if (outcome.status === 'rejected') {
      failures.push({
        id,
        error: String(outcome.reason?.message || outcome.reason || '未知错误'),
      });
      return;
    }
    const result = outcome.value.result;
    if (typeof result === 'number') {
      dimensions.phonemes = {
        status: 'available',
        score: Math.max(0, Math.min(100, Math.round(result))),
        details: null,
      };
      return;
    }
    if (result?.acoustic) acoustic = result.acoustic;
    if (result?.moraAlignment) moraAlignment = result.moraAlignment;
    for (const name of PRONUNCIATION_DIMENSIONS) {
      if (!result || !result[name]) continue;
      const value =
        typeof result[name] === 'number'
          ? { score: result[name] }
          : result[name];
      dimensions[name] = {
        status: value.status || 'available',
        score:
          typeof value.score === 'number'
            ? Math.max(0, Math.min(100, Math.round(value.score)))
            : null,
        details: value.details ?? null,
      };
    }
  });

  const availableDimensions = PRONUNCIATION_DIMENSIONS.filter(
    (name) =>
      dimensions[name].status === 'available' ||
      dimensions[name].status === 'estimated',
  );
  return {
    schemaVersion: PRONUNCIATION_FEATURE_SCHEMA_VERSION,
    status: analyzers.length
      ? availableDimensions.length
        ? 'partial'
        : acoustic
          ? 'analyzed'
          : 'failed'
      : 'not-configured',
    overallScore: null,
    acoustic,
    moraAlignment,
    dimensions,
    availableDimensions,
    textMatchScore:
      typeof input.textMatchScore === 'number' ? input.textMatchScore : null,
    failures,
  };
}
