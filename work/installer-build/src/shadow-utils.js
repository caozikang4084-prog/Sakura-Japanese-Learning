const SHADOW_VOWEL_GROUPS = {
  あ: 'あかさたなはまやらわがざだばぱぁゃ',
  い: 'いきしちにひみりゐぎじぢびぴぃ',
  う: 'うくすつぬふむゆるゔぐずづぶぷぅゅ',
  え: 'えけせてねへめれゑげぜでべぺぇ',
  お: 'おこそとのほもよろをごぞどぼぽぉょ',
};

const SHADOW_KANA_VOWEL = Object.fromEntries(
  Object.entries(SHADOW_VOWEL_GROUPS).flatMap(([vowel, kana]) =>
    Array.from(kana).map((character) => [character, vowel]),
  ),
);

const SHADOW_RECORDING_QUALITY_VERSION = 1;
const SHADOW_MIN_RECORDING_SECONDS = 0.5;

function shadowAnalyzeRecording(samples, sampleRate) {
  const length = Number(samples?.length) || 0;
  const rate = Number(sampleRate) || 0;
  const base = {
    schemaVersion: SHADOW_RECORDING_QUALITY_VERSION,
    status: 'invalid',
    canScore: false,
    metrics: {
      durationSeconds: rate > 0 ? length / rate : 0,
      sampleRate: rate,
      peak: 0,
      rms: 0,
      activeRatio: 0,
      clippingRatio: 0,
      invalidRatio: 0,
    },
    warnings: [],
  };

  if (!length || !Number.isFinite(rate) || rate < 8000) {
    base.metrics.invalidRatio = 1;
    return base;
  }

  let sumSquares = 0;
  let peak = 0;
  let clipped = 0;
  let invalid = 0;
  for (let index = 0; index < length; index += 1) {
    const value = Number(samples[index]);
    if (!Number.isFinite(value)) {
      invalid += 1;
      continue;
    }
    const absolute = Math.abs(value);
    peak = Math.max(peak, absolute);
    sumSquares += value * value;
    if (absolute >= 0.98) clipped += 1;
  }

  const invalidRatio = invalid / length;
  const rms = Math.sqrt(sumSquares / Math.max(1, length - invalid));
  const frameSize = Math.max(1, Math.round(rate * 0.02));
  let frameCount = 0;
  let activeFrames = 0;
  for (let start = 0; start < length; start += frameSize) {
    const end = Math.min(length, start + frameSize);
    let frameSquares = 0;
    let frameSamples = 0;
    for (let index = start; index < end; index += 1) {
      const value = Number(samples[index]);
      if (!Number.isFinite(value)) continue;
      frameSquares += value * value;
      frameSamples += 1;
    }
    if (!frameSamples) continue;
    frameCount += 1;
    if (Math.sqrt(frameSquares / frameSamples) >= 0.003) activeFrames += 1;
  }

  const activeRatio = frameCount ? activeFrames / frameCount : 0;
  const clippingRatio = clipped / length;
  const metrics = {
    durationSeconds: length / rate,
    sampleRate: rate,
    peak,
    rms,
    activeRatio,
    clippingRatio,
    invalidRatio,
  };

  if (invalidRatio > 0.005) {
    return { ...base, metrics };
  }
  if (metrics.durationSeconds < SHADOW_MIN_RECORDING_SECONDS) {
    return { ...base, status: 'too-short', metrics };
  }
  if (peak < 0.0005) {
    return { ...base, status: 'silent', metrics };
  }
  if (peak < 0.003 || rms < 0.0007 || activeRatio < 0.05) {
    return { ...base, status: 'too-low', metrics };
  }

  const warnings =
    clippingRatio > 0.02
      ? [{ code: 'clipping' }]
      : [];
  return {
    schemaVersion: SHADOW_RECORDING_QUALITY_VERSION,
    status: 'good',
    canScore: true,
    metrics,
    warnings,
  };
}

function shadowQualityMessage(quality) {
  const duration = Number(quality?.metrics?.durationSeconds || 0).toFixed(1);
  switch (quality?.status) {
    case 'too-short':
      return `录音过短（${duration} 秒），请完整朗读后再停止。`;
    case 'silent':
      return '未检测到有效声音。请检查所选麦克风、耳机静音键和 Windows 麦克风权限。';
    case 'too-low':
      return '录音音量过低。请靠近麦克风或提高系统输入音量后重试。';
    case 'invalid':
      return '录音数据异常，请重新录制。';
    case 'good':
      return quality.warnings?.some((item) => item.code === 'clipping')
        ? '录音峰值接近上限，可能产生爆音；本次可以评分，但建议稍微远离麦克风。'
        : '录音质量可用。';
    default:
      return '录音质量无法确认，请重新录制。';
  }
}

function expandShadowLongVowels(value) {
  let result = '';
  for (const character of value) {
    if (character !== 'ー') {
      result += character;
      continue;
    }
    const previous = Array.from(result).at(-1);
    result += SHADOW_KANA_VOWEL[previous] || character;
  }
  return result;
}

function normalizeShadowText(value) {
  const normalized = String(value ?? '')
    .normalize('NFKC')
    .replace(/[\s。、，,.！!？?「」『』・…〜~:：;；—–-]/g, '')
    .replace(/[\u30a1-\u30f6]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0x60),
    )
    .toLowerCase();
  return expandShadowLongVowels(normalized);
}

function shadowRecognitionReading(value, words, readingLexicon) {
  const lexicon = readingLexicon || {};
  const lookup = (token) => {
    const raw = String(token ?? '').normalize('NFKC').trim();
    const surface = raw
      .replace(/[\s。、，,.！!？?「」『』・…〜~:：;；—–-]/g, '');
    if (raw && lexicon[raw]) return lexicon[raw];
    return surface && lexicon[surface] ? lexicon[surface] : token;
  };

  if (Array.isArray(words) && words.length) {
    return words
      .map((word) => lookup(word && typeof word === 'object' ? word.word : word))
      .join('');
  }
  return lookup(value);
}

function alignShadowText(expectedValue, actualValue) {
  const expected = Array.from(normalizeShadowText(expectedValue));
  const actual = Array.from(normalizeShadowText(actualValue));
  const rows = expected.length + 1;
  const columns = actual.length + 1;
  const distance = Array.from({ length: rows }, () => new Array(columns).fill(0));

  for (let row = 1; row < rows; row += 1) distance[row][0] = row;
  for (let column = 1; column < columns; column += 1) distance[0][column] = column;

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitution =
        distance[row - 1][column - 1] + (expected[row - 1] === actual[column - 1] ? 0 : 1);
      distance[row][column] = Math.min(
        distance[row - 1][column] + 1,
        distance[row][column - 1] + 1,
        substitution,
      );
    }
  }

  const missing = [];
  const extra = [];
  const substitutions = [];
  let row = expected.length;
  let column = actual.length;

  while (row > 0 || column > 0) {
    if (
      row > 0 &&
      column > 0 &&
      expected[row - 1] === actual[column - 1] &&
      distance[row][column] === distance[row - 1][column - 1]
    ) {
      row -= 1;
      column -= 1;
    } else if (
      row > 0 &&
      column > 0 &&
      distance[row][column] === distance[row - 1][column - 1] + 1
    ) {
      substitutions.push({
        expected: expected[row - 1],
        actual: actual[column - 1],
      });
      row -= 1;
      column -= 1;
    } else if (row > 0 && distance[row][column] === distance[row - 1][column] + 1) {
      missing.push(expected[row - 1]);
      row -= 1;
    } else {
      extra.push(actual[column - 1]);
      column -= 1;
    }
  }

  missing.reverse();
  extra.reverse();
  substitutions.reverse();
  const denominator = Math.max(expected.length, actual.length);
  const score = denominator
    ? Math.max(0, Math.round((1 - distance[expected.length][actual.length] / denominator) * 100))
    : 0;

  return {
    score,
    expected: expected.join(''),
    actual: actual.join(''),
    missing,
    extra,
    substitutions,
  };
}
