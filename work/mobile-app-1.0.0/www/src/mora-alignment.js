// Local mora-level alignment using MFCC and constrained DTW.
//
// Mora boundaries are approximate: no phoneme forced aligner or large model is
// used. This module therefore reports alignment quality and low-confidence time
// ranges, never a pronunciation correctness percentage.

const MORA_ALIGNMENT_SCHEMA_VERSION = 1;
const MORA_MFCC_FRAME_SECONDS = 0.025;
const MORA_MFCC_HOP_SECONDS = 0.01;
const MORA_MFCC_COEFFICIENTS = 13;
const MORA_MEL_FILTERS = 26;
const moraMfccBankCache = new Map();

function moraKatakanaToHiragana(value) {
  return String(value ?? '').replace(/[\u30a1-\u30f6]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0x60),
  );
}

function japaneseTextToMora(reading, sourceText = '') {
  const raw = String(reading || sourceText || '').normalize('NFKC');
  const kana = moraKatakanaToHiragana(raw).replace(
    /[\s。、，,.！!？?「」『』・…〜~:：;；—–-]/g,
    '',
  );
  const unresolved = Array.from(kana).filter((character) =>
    /[\u3400-\u9fff]/u.test(character),
  );
  if (unresolved.length) {
    return {
      schemaVersion: MORA_ALIGNMENT_SCHEMA_VERSION,
      status: 'unresolved',
      kana,
      moras: [],
      moraCount: 0,
      unresolved,
      reason: '文本中仍有未转换为假名的汉字',
    };
  }

  const smallKana = new Set(Array.from('ゃゅょぁぃぅぇぉゎ'));
  const moras = [];
  for (const character of kana) {
    if (smallKana.has(character) && moras.length) {
      moras[moras.length - 1].kana += character;
      continue;
    }
    let type = 'normal';
    if (character === 'ー') type = 'long';
    else if (character === 'っ') type = 'geminate';
    else if (character === 'ん') type = 'nasal';
    moras.push({
      index: moras.length,
      kana: character,
      type,
    });
  }

  return {
    schemaVersion: MORA_ALIGNMENT_SCHEMA_VERSION,
    status: moras.length ? 'ok' : 'unresolved',
    kana,
    moras,
    moraCount: moras.length,
    unresolved,
    reason: moras.length ? null : '没有可识别的假名',
  };
}

function moraNextPowerOfTwo(value) {
  let size = 1;
  while (size < value) size <<= 1;
  return size;
}

function moraFft(real, imaginary) {
  const length = real.length;
  for (let index = 1, reversed = 0; index < length; index += 1) {
    let bit = length >> 1;
    for (; reversed & bit; bit >>= 1) reversed ^= bit;
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imaginary[index], imaginary[reversed]] = [
        imaginary[reversed],
        imaginary[index],
      ];
    }
  }
  for (let size = 2; size <= length; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    const half = size >> 1;
    for (let start = 0; start < length; start += size) {
      for (let offset = 0; offset < half; offset += 1) {
        const cosine = Math.cos(angle * offset);
        const sine = Math.sin(angle * offset);
        const even = start + offset;
        const odd = even + half;
        const oddReal = real[odd] * cosine - imaginary[odd] * sine;
        const oddImaginary = real[odd] * sine + imaginary[odd] * cosine;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
      }
    }
  }
}

function moraHzToMel(hz) {
  return 2595 * Math.log10(1 + hz / 700);
}

function moraMelToHz(mel) {
  return 700 * (10 ** (mel / 2595) - 1);
}

function moraMfccBank(sampleRate, fftSize) {
  const key = `${sampleRate}:${fftSize}`;
  if (moraMfccBankCache.has(key)) return moraMfccBankCache.get(key);
  const lowMel = moraHzToMel(80);
  const highMel = moraHzToMel(Math.min(7600, sampleRate / 2));
  const points = Array.from(
    { length: MORA_MEL_FILTERS + 2 },
    (_, index) =>
      moraMelToHz(
        lowMel + ((highMel - lowMel) * index) / (MORA_MEL_FILTERS + 1),
      ),
  );
  const filters = [];
  for (let filter = 0; filter < MORA_MEL_FILTERS; filter += 1) {
    const left = points[filter];
    const center = points[filter + 1];
    const right = points[filter + 2];
    const values = [];
    for (let bin = 0; bin <= fftSize / 2; bin += 1) {
      const hz = (bin * sampleRate) / fftSize;
      let weight = 0;
      if (hz >= left && hz <= center && center > left) {
        weight = (hz - left) / (center - left);
      } else if (hz > center && hz <= right && right > center) {
        weight = (right - hz) / (right - center);
      }
      if (weight) values.push({ bin, weight });
    }
    filters.push(values);
  }
  const dct = Array.from({ length: MORA_MFCC_COEFFICIENTS }, (_, coefficient) =>
    Array.from({ length: MORA_MEL_FILTERS }, (_, filter) =>
      Math.cos(
        (Math.PI * coefficient * (filter + 0.5)) / MORA_MEL_FILTERS,
      ),
    ),
  );
  const bank = { filters, dct };
  moraMfccBankCache.set(key, bank);
  return bank;
}

function moraComputeMfcc(samples, sampleRate) {
  const rate = Number(sampleRate) || 0;
  if (!samples?.length || !Number.isFinite(rate) || rate < 8000) {
    return {
      status: 'unavailable',
      reason: 'invalid-signal',
      frames: [],
      startSeconds: 0,
      endSeconds: 0,
      durationSeconds: 0,
    };
  }
  const frameLength = Math.max(32, Math.round(rate * MORA_MFCC_FRAME_SECONDS));
  const hopLength = Math.max(1, Math.round(rate * MORA_MFCC_HOP_SECONDS));
  const fftSize = moraNextPowerOfTwo(frameLength);
  const bank = moraMfccBank(rate, fftSize);
  const totalFrames = Math.max(
    0,
    Math.floor((samples.length - frameLength) / hopLength) + 1,
  );
  const frameLevels = [];
  for (let frame = 0; frame < totalFrames; frame += 1) {
    const start = frame * hopLength;
    let squares = 0;
    for (let offset = 0; offset < frameLength; offset += 1) {
      const value = Number(samples[start + offset]);
      if (Number.isFinite(value)) squares += value * value;
    }
    frameLevels.push(Math.sqrt(squares / frameLength));
  }
  if (!frameLevels.length) {
    return {
      status: 'unavailable',
      reason: 'too-few-frames',
      frames: [],
      startSeconds: 0,
      endSeconds: 0,
      durationSeconds: 0,
    };
  }
  const peak = Math.max(...frameLevels);
  const threshold = Math.max(0.0015, peak * 0.09);
  const active = frameLevels
    .map((value, index) => (value >= threshold ? index : -1))
    .filter((index) => index >= 0);
  if (active.length < 5) {
    return {
      status: 'unavailable',
      reason: 'insufficient-speech',
      frames: [],
      startSeconds: 0,
      endSeconds: 0,
      durationSeconds: 0,
    };
  }

  const firstFrame = active[0];
  const lastFrame = active.at(-1);
  const frames = [];
  for (let frame = firstFrame; frame <= lastFrame; frame += 1) {
    const start = frame * hopLength;
    const real = new Float64Array(fftSize);
    const imaginary = new Float64Array(fftSize);
    let previous = 0;
    for (let offset = 0; offset < frameLength; offset += 1) {
      const current = Number(samples[start + offset]);
      const finite = Number.isFinite(current) ? current : 0;
      const emphasized = finite - previous * 0.97;
      previous = finite;
      const window =
        0.54 -
        0.46 *
          Math.cos((2 * Math.PI * offset) / Math.max(1, frameLength - 1));
      real[offset] = emphasized * window;
    }
    moraFft(real, imaginary);
    const power = Array.from(
      { length: fftSize / 2 + 1 },
      (_, bin) => real[bin] * real[bin] + imaginary[bin] * imaginary[bin],
    );
    const melEnergies = bank.filters.map((filter) =>
      Math.max(
        1e-10,
        filter.reduce((sum, item) => sum + power[item.bin] * item.weight, 0),
      ),
    );
    const logs = melEnergies.map((value) => Math.log(value));
    const coefficients = bank.dct.map((weights) =>
      weights.reduce((sum, weight, index) => sum + weight * logs[index], 0),
    );
    coefficients.push(Math.log(frameLevels[frame] + 1e-7));
    frames.push({
      timeSeconds: (start + frameLength / 2) / rate,
      vector: coefficients,
    });
  }

  const dimensions = frames[0].vector.length;
  for (let dimension = 0; dimension < dimensions; dimension += 1) {
    const values = frames.map((frame) => frame.vector[dimension]);
    const mean =
      values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      Math.max(1, values.length);
    const deviation = Math.sqrt(variance) || 1;
    frames.forEach((frame) => {
      frame.vector[dimension] = (frame.vector[dimension] - mean) / deviation;
    });
  }

  return {
    status: 'ok',
    reason: null,
    frames,
    startSeconds: frames[0].timeSeconds,
    endSeconds: frames.at(-1).timeSeconds,
    durationSeconds: frames.at(-1).timeSeconds - frames[0].timeSeconds,
    hopSeconds: MORA_MFCC_HOP_SECONDS,
  };
}

function moraVectorDistance(left, right) {
  let sum = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left[index] - right[index];
    sum += difference * difference;
  }
  return Math.sqrt(sum / Math.max(1, length));
}

function moraDtw(user, reference) {
  if (user.status !== 'ok' || reference.status !== 'ok') {
    return {
      status: 'unavailable',
      reason: 'MFCC 特征不足',
      path: [],
    };
  }
  const rows = reference.frames.length;
  const columns = user.frames.length;
  const window = Math.max(80, Math.abs(rows - columns) + 60);
  const costs = new Float64Array(rows * columns);
  costs.fill(Number.POSITIVE_INFINITY);
  const moves = new Uint8Array(rows * columns);
  const indexOf = (row, column) => row * columns + column;

  for (let row = 0; row < rows; row += 1) {
    const center = Math.round(
      (row / Math.max(1, rows - 1)) * Math.max(0, columns - 1),
    );
    const from = Math.max(0, center - window);
    const to = Math.min(columns - 1, center + window);
    for (let column = from; column <= to; column += 1) {
      const local = moraVectorDistance(
        reference.frames[row].vector,
        user.frames[column].vector,
      );
      if (row === 0 && column === 0) {
        costs[indexOf(row, column)] = local;
        continue;
      }
      let best = Number.POSITIVE_INFINITY;
      let move = 0;
      if (row > 0 && column > 0) {
        const value = costs[indexOf(row - 1, column - 1)];
        if (value < best) {
          best = value;
          move = 1;
        }
      }
      if (row > 0) {
        const value = costs[indexOf(row - 1, column)];
        if (value < best) {
          best = value;
          move = 2;
        }
      }
      if (column > 0) {
        const value = costs[indexOf(row, column - 1)];
        if (value < best) {
          best = value;
          move = 3;
        }
      }
      if (Number.isFinite(best)) {
        costs[indexOf(row, column)] = best + local;
        moves[indexOf(row, column)] = move;
      }
    }
  }

  const finalCost = costs[indexOf(rows - 1, columns - 1)];
  if (!Number.isFinite(finalCost)) {
    return {
      status: 'unavailable',
      reason: 'DTW 路径搜索失败',
      path: [],
    };
  }

  const path = [];
  let row = rows - 1;
  let column = columns - 1;
  while (row >= 0 && column >= 0) {
    path.push({ referenceIndex: row, userIndex: column });
    if (row === 0 && column === 0) break;
    const move = moves[indexOf(row, column)];
    if (move === 1) {
      row -= 1;
      column -= 1;
    } else if (move === 2) {
      row -= 1;
    } else if (move === 3) {
      column -= 1;
    } else {
      break;
    }
  }
  path.reverse();
  const uniqueReference = new Set(path.map((item) => item.referenceIndex)).size;
  const uniqueUser = new Set(path.map((item) => item.userIndex)).size;
  const referenceCoverage = uniqueReference / rows;
  const userCoverage = uniqueUser / columns;
  const meanCost = finalCost / Math.max(1, path.length);
  let horizontalSteps = 0;
  let verticalSteps = 0;
  for (let index = 1; index < path.length; index += 1) {
    if (path[index].referenceIndex === path[index - 1].referenceIndex) {
      horizontalSteps += 1;
    }
    if (path[index].userIndex === path[index - 1].userIndex) {
      verticalSteps += 1;
    }
  }
  return {
    status: 'ok',
    reason: null,
    path,
    rows,
    columns,
    meanCost,
    referenceCoverage,
    userCoverage,
    horizontalRatio: horizontalSteps / Math.max(1, path.length - 1),
    verticalRatio: verticalSteps / Math.max(1, path.length - 1),
    durationRatio: columns / Math.max(1, rows),
  };
}

function moraBoundaryFrame(timeSeconds, referenceMfcc) {
  if (typeof timeSeconds !== 'number' || !Number.isFinite(timeSeconds)) {
    return null;
  }
  const halfHop = referenceMfcc.hopSeconds / 2;
  let bestFrame = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  referenceMfcc.frames.forEach((frame, index) => {
    const distance = Math.abs(frame.timeSeconds - timeSeconds);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestFrame = index;
    }
  });
  return bestDistance <= Math.max(0.1, halfHop * 3) ? bestFrame : null;
}

function moraReferenceRanges(moras, referenceMfcc, explicitBoundaries) {
  const frameCount = referenceMfcc.frames.length;
  if (!Array.isArray(explicitBoundaries) || !explicitBoundaries.length) {
    return {
      ranges: moras.map((mora) => ({
        from: Math.floor((mora.index * frameCount) / moras.length),
        to: Math.max(
          Math.floor((mora.index * frameCount) / moras.length),
          Math.ceil(((mora.index + 1) * frameCount) / moras.length) - 1,
        ),
      })),
      source: 'equal-frames',
      providedCount: 0,
    };
  }

  const boundaries = moras.map((mora) =>
    moraBoundaryFrame(explicitBoundaries[mora.index], referenceMfcc),
  );
  boundaries[0] ??= 0;
  boundaries.push(frameCount);
  let providedCount = 0;
  boundaries.forEach((value, index) => {
    if (index < moras.length && value !== null) providedCount += 1;
  });

  for (let index = 0; index < boundaries.length; index += 1) {
    if (boundaries[index] !== null) continue;
    let before = index - 1;
    while (before >= 0 && boundaries[before] === null) before -= 1;
    let after = index + 1;
    while (after < boundaries.length && boundaries[after] === null) after += 1;
    const left = before >= 0 ? boundaries[before] : 0;
    const right = after < boundaries.length ? boundaries[after] : frameCount;
    const fraction =
      after >= boundaries.length
        ? 0
        : (index - before) / Math.max(1, after - before);
    boundaries[index] = Math.round(left + (right - left) * fraction);
  }
  for (let index = 1; index < boundaries.length; index += 1) {
    boundaries[index] = Math.max(boundaries[index], boundaries[index - 1]);
  }
  return {
    ranges: moras.map((mora) => ({
      from: Math.min(frameCount - 1, boundaries[mora.index]),
      to: Math.max(
        Math.min(frameCount - 1, boundaries[mora.index]),
        Math.min(frameCount - 1, boundaries[mora.index + 1] - 1),
      ),
    })),
    source: 'provided',
    providedCount,
  };
}

function moraAlignIntervals(
  moras,
  dtw,
  userMfcc,
  referenceMfcc,
  explicitBoundaries = null,
) {
  const referenceFrames = referenceMfcc.frames.length;
  const referenceRanges = moraReferenceRanges(
    moras,
    referenceMfcc,
    explicitBoundaries,
  );
  const intervals = [];
  let previousEnd = 0;
  for (const mora of moras) {
    const { from, to } = referenceRanges.ranges[mora.index];
    const pathEntries = dtw.path.filter(
      (item) =>
        item.referenceIndex >= from && item.referenceIndex <= to,
    );
    if (!pathEntries.length) {
      intervals.push({
        ...mora,
        startSeconds: null,
        endSeconds: null,
        durationSeconds: null,
        referenceStartSeconds: null,
        referenceEndSeconds: null,
        confidence: 'unavailable',
      });
      continue;
    }
    const firstUser = pathEntries[0].userIndex;
    const lastUser = pathEntries.at(-1).userIndex;
    const startSeconds = Math.max(
      previousEnd,
      Math.max(0, userMfcc.frames[firstUser].timeSeconds - userMfcc.hopSeconds / 2),
    );
    const endSeconds = Math.max(
      startSeconds + userMfcc.hopSeconds,
      userMfcc.frames[lastUser].timeSeconds + userMfcc.hopSeconds / 2,
    );
    previousEnd = endSeconds;
    intervals.push({
      ...mora,
      startSeconds,
      endSeconds,
      durationSeconds: endSeconds - startSeconds,
      referenceStartSeconds: referenceMfcc.frames[from].timeSeconds,
      referenceEndSeconds: referenceMfcc.frames[to].timeSeconds,
      confidence: 'low',
    });
  }
  return { intervals, boundarySource: referenceRanges.source, providedCount: referenceRanges.providedCount };
}

function analyzeJapaneseMoraAlignment({
  userSamples,
  userSampleRate,
  referenceSamples,
  referenceSampleRate,
  expectedReading,
  sourceText = '',
  textMatchScore = null,
  recordingQuality = null,
  referenceMoraBoundaries = null,
}) {
  const moraText = japaneseTextToMora(expectedReading, sourceText);
  const unavailable = (reason) => ({
    schemaVersion: MORA_ALIGNMENT_SCHEMA_VERSION,
    status: 'unavailable',
    reason,
    confidence: 'low',
    text: moraText,
    quality: null,
    moras: [],
    prosodyHooks: { longVowels: [], gemination: [] },
  });

  if (recordingQuality && recordingQuality.canScore === false) {
    return unavailable('录音质量不足');
  }
  if (moraText.status !== 'ok') {
    return unavailable(moraText.reason || '无法转换为莫拉序列');
  }
  if (typeof textMatchScore === 'number' && textMatchScore < 55) {
    return {
      ...unavailable('识别文本与标准文本差异过大，未强行执行对齐'),
      status: 'skipped-text-mismatch',
    };
  }
  if (!referenceSamples?.length) {
    return unavailable('缺少可用于莫拉对齐的标准音频');
  }

  const userMfcc = moraComputeMfcc(userSamples, userSampleRate);
  const referenceMfcc = moraComputeMfcc(referenceSamples, referenceSampleRate);
  if (userMfcc.status !== 'ok') {
    return unavailable(`用户录音特征不足：${userMfcc.reason}`);
  }
  if (referenceMfcc.status !== 'ok') {
    return unavailable(`标准音频特征不足：${referenceMfcc.reason}`);
  }
  const dtw = moraDtw(userMfcc, referenceMfcc);
  if (dtw.status !== 'ok') return unavailable(dtw.reason);
  if (
    dtw.referenceCoverage < 0.72 ||
    dtw.userCoverage < 0.72 ||
    dtw.meanCost > 1.65
  ) {
    return {
      ...unavailable('DTW 路径质量不足，暂不输出莫拉时间区间'),
      quality: {
        meanCost: dtw.meanCost,
        referenceCoverage: dtw.referenceCoverage,
        userCoverage: dtw.userCoverage,
        durationRatio: dtw.durationRatio,
      },
    };
  }

  const intervalResult = moraAlignIntervals(
    moraText.moras,
    dtw,
    userMfcc,
    referenceMfcc,
    referenceMoraBoundaries,
  );
  const moras = intervalResult.intervals;
  const longVowels = moras
    .filter((mora) => mora.type === 'long')
    .map((mora) => ({
      moraIndex: mora.index,
      kana: mora.kana,
      startSeconds: mora.startSeconds,
      endSeconds: mora.endSeconds,
      durationSeconds: mora.durationSeconds,
    }));
  const gemination = moras
    .filter((mora) => mora.type === 'geminate')
    .map((mora) => ({
      moraIndex: mora.index,
      kana: mora.kana,
      startSeconds: mora.startSeconds,
      endSeconds: mora.endSeconds,
      durationSeconds: mora.durationSeconds,
    }));

  return {
    schemaVersion: MORA_ALIGNMENT_SCHEMA_VERSION,
    status: 'ok',
    reason: null,
    confidence: 'low',
    label: '莫拉级近似对齐完成',
    text: moraText,
    quality: {
      meanCost: dtw.meanCost,
      referenceCoverage: dtw.referenceCoverage,
      userCoverage: dtw.userCoverage,
      horizontalRatio: dtw.horizontalRatio,
      verticalRatio: dtw.verticalRatio,
      durationRatio: dtw.durationRatio,
      textMatchScore,
      boundarySource: intervalResult.boundarySource,
      providedMoraBoundaries: intervalResult.providedCount,
    },
    moras,
    prosodyHooks: { longVowels, gemination },
    disclaimer:
      '莫拉边界由 MFCC 与 DTW 近似映射得到；当前没有音素级强制对齐，不能据此判定单个音素发音正确。',
  };
}
