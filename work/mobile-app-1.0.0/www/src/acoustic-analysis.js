// Lightweight, local-only acoustic analysis.
//
// This module deliberately does not claim phoneme or pitch-accent accuracy.
// It extracts verifiable signal features and only reports a prosody condition
// when the evidence is sufficient. Otherwise the result is marked unavailable.

const ACOUSTIC_ANALYSIS_SCHEMA_VERSION = 1;
const ACOUSTIC_FRAME_SECONDS = 0.02;
const ACOUSTIC_F0_FRAME_SECONDS = 0.04;
const ACOUSTIC_F0_HOP_SECONDS = 0.01;
const ACOUSTIC_MIN_F0 = 70;
const ACOUSTIC_MAX_F0 = 500;

function acousticPercentile(values, fraction) {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(
    ordered.length - 1,
    Math.max(0, Math.round((ordered.length - 1) * fraction)),
  );
  return ordered[index];
}

function acousticMedian(values) {
  return acousticPercentile(values, 0.5);
}

function acousticMean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function acousticFrameRms(samples, sampleRate, frameSeconds = ACOUSTIC_FRAME_SECONDS) {
  const frameSize = Math.max(1, Math.round(sampleRate * frameSeconds));
  const hopSize = frameSize;
  const frames = [];
  for (let start = 0; start < samples.length; start += hopSize) {
    const end = Math.min(samples.length, start + frameSize);
    let squares = 0;
    let valid = 0;
    for (let index = start; index < end; index += 1) {
      const value = Number(samples[index]);
      if (!Number.isFinite(value)) continue;
      squares += value * value;
      valid += 1;
    }
    frames.push({
      start,
      end,
      rms: valid ? Math.sqrt(squares / valid) : 0,
    });
  }
  return { frames, frameSize, hopSize };
}

function acousticSilenceProfile(frames, sampleRate) {
  const rmsValues = frames.map((frame) => frame.rms);
  const peak = Math.max(0, ...rmsValues);
  const threshold = Math.max(0.0015, peak * 0.09);
  const active = rmsValues.map((value) => value >= threshold);
  const activeIndices = active
    .map((value, index) => (value ? index : -1))
    .filter((index) => index >= 0);
  if (!activeIndices.length) {
    return {
      threshold,
      peakRms: peak,
      speechStartSeconds: 0,
      speechEndSeconds: 0,
      speechDurationSeconds: 0,
      voicedDurationSeconds: 0,
      leadingSilenceSeconds: 0,
      trailingSilenceSeconds: 0,
      internalSilenceSeconds: 0,
      internalSilenceGaps: [],
      activeFrameRatio: 0,
    };
  }

  const frameSeconds = frames[0]
    ? (frames[0].end - frames[0].start) / sampleRate
    : ACOUSTIC_FRAME_SECONDS;
  const first = activeIndices[0];
  const last = activeIndices.at(-1);
  const gaps = [];
  let runStart = -1;
  for (let index = first + 1; index < last; index += 1) {
    if (!active[index] && runStart < 0) runStart = index;
    if (active[index] && runStart >= 0) {
      const seconds = (index - runStart) * frameSeconds;
      if (seconds >= 0.08) {
        gaps.push({ startSeconds: runStart * frameSeconds, durationSeconds: seconds });
      }
      runStart = -1;
    }
  }

  return {
    threshold,
    peakRms: peak,
    speechStartSeconds: first * frameSeconds,
    speechEndSeconds: (last + 1) * frameSeconds,
    speechDurationSeconds: (last - first + 1) * frameSeconds,
    voicedDurationSeconds:
      activeIndices.length * frameSeconds,
    leadingSilenceSeconds: first * frameSeconds,
    trailingSilenceSeconds: Math.max(0, (frames.length - last - 1) * frameSeconds),
    internalSilenceSeconds: gaps.reduce(
      (sum, gap) => sum + gap.durationSeconds,
      0,
    ),
    internalSilenceGaps: gaps,
    activeFrameRatio: activeIndices.length / Math.max(1, frames.length),
  };
}

function acousticEstimateF0(samples, sampleRate) {
  const frameSize = Math.max(1, Math.round(sampleRate * ACOUSTIC_F0_FRAME_SECONDS));
  const hopSize = Math.max(1, Math.round(sampleRate * ACOUSTIC_F0_HOP_SECONDS));
  const minLag = Math.max(1, Math.floor(sampleRate / ACOUSTIC_MAX_F0));
  const maxLag = Math.max(minLag + 1, Math.floor(sampleRate / ACOUSTIC_MIN_F0));
  const raw = [];

  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    const frame = new Float32Array(frameSize);
    let mean = 0;
    let energy = 0;
    for (let index = 0; index < frameSize; index += 1) {
      const value = Number(samples[start + index]);
      if (Number.isFinite(value)) {
        frame[index] = value;
        mean += value;
        energy += value * value;
      }
    }
    mean /= frameSize;
    let frameRms = 0;
    for (let index = 0; index < frameSize; index += 1) {
      frame[index] -= mean;
      frameRms += frame[index] * frame[index];
    }
    frameRms = Math.sqrt(frameRms / frameSize);
    if (frameRms < 0.003) {
      raw.push(null);
      continue;
    }

    const correlations = [];
    for (let lag = minLag; lag <= Math.min(maxLag, frameSize - 2); lag += 1) {
      let correlation = 0;
      let leftEnergy = 0;
      let rightEnergy = 0;
      for (let index = 0; index < frameSize - lag; index += 1) {
        const left = frame[index];
        const right = frame[index + lag];
        correlation += left * right;
        leftEnergy += left * left;
        rightEnergy += right * right;
      }
      const denominator = Math.sqrt(leftEnergy * rightEnergy);
      correlations.push(denominator ? correlation / denominator : 0);
    }
    let bestLag = 0;
    let bestScore = 0;
    for (let index = 1; index < correlations.length - 1; index += 1) {
      if (
        correlations[index] >= 0.36 &&
        correlations[index] >= correlations[index - 1] &&
        correlations[index] > correlations[index + 1]
      ) {
        bestScore = correlations[index];
        bestLag = minLag + index;
        break;
      }
    }
    raw.push(bestScore >= 0.36 && bestLag ? sampleRate / bestLag : null);
  }

  const filtered = raw.map((value, index) => {
    if (value === null) return null;
    const neighborhood = raw
      .slice(Math.max(0, index - 2), Math.min(raw.length, index + 3))
      .filter((item) => item !== null);
    if (neighborhood.length < 3) return value;
    const median = acousticMedian(neighborhood);
    if (!median || value > median * 1.8 || value < median * 0.55) return null;
    return value;
  });
  const voiced = filtered.filter((value) => value !== null);
  const median = acousticMedian(voiced);
  const low = acousticPercentile(voiced, 0.1);
  const high = acousticPercentile(voiced, 0.9);
  const pitchRangeSemitones =
    low && high ? 12 * Math.log2(high / low) : 0;
  const contour = median
    ? voiced.map((value) => 12 * Math.log2(value / median))
    : [];

  return {
    frameSeconds: ACOUSTIC_F0_FRAME_SECONDS,
    hopSeconds: ACOUSTIC_F0_HOP_SECONDS,
    values: filtered,
    voicedFrames: voiced.length,
    voicedRatio: filtered.length ? voiced.length / filtered.length : 0,
    medianHz: median,
    lowHz: low,
    highHz: high,
    pitchRangeSemitones,
    relativeContour: contour,
  };
}

function acousticAnalyzeSignal(samples, sampleRate) {
  const rate = Number(sampleRate) || 0;
  if (!samples?.length || !Number.isFinite(rate) || rate < 8000) {
    return {
      schemaVersion: ACOUSTIC_ANALYSIS_SCHEMA_VERSION,
      status: 'unavailable',
      reason: 'invalid-signal',
      durationSeconds: 0,
      energy: null,
      silence: null,
      f0: null,
      energyNucleiEstimate: null,
    };
  }
  const { frames } = acousticFrameRms(samples, rate);
  const silence = acousticSilenceProfile(frames, rate);
  const f0 = acousticEstimateF0(samples, rate);
  const activeRms = frames
    .map((frame) => frame.rms)
    .filter((value) => value >= silence.threshold);
  const smoothed = frames.map((frame, index) => {
    const start = Math.max(0, index - 1);
    const end = Math.min(frames.length, index + 2);
    return acousticMean(frames.slice(start, end).map((item) => item.rms));
  });
  const peakLevel = Math.max(0, ...smoothed);
  const peakThreshold = Math.max(0.004, peakLevel * 0.18);
  const minimumDistanceFrames = Math.max(1, Math.round(0.09 / ACOUSTIC_FRAME_SECONDS));
  const peaks = [];
  for (let index = 1; index < smoothed.length - 1; index += 1) {
    if (
      smoothed[index] >= peakThreshold &&
      smoothed[index] >= smoothed[index - 1] &&
      smoothed[index] > smoothed[index + 1]
    ) {
      const previous = peaks.at(-1);
      if (previous === undefined || index - previous >= minimumDistanceFrames) {
        peaks.push(index);
      } else if (smoothed[index] > smoothed[previous]) {
        peaks[peaks.length - 1] = index;
      }
    }
  }

  return {
    schemaVersion: ACOUSTIC_ANALYSIS_SCHEMA_VERSION,
    status: 'ok',
    reason: null,
    durationSeconds: samples.length / rate,
    energy: {
      peakRms: silence.peakRms,
      meanVoicedRms: acousticMean(activeRms),
      dbFS: silence.peakRms ? 20 * Math.log10(silence.peakRms) : null,
    },
    silence,
    f0,
    energyNucleiEstimate: peaks.length || null,
  };
}

function acousticJapaneseMoras(reading) {
  const normalized = String(reading || '')
    .normalize('NFKC')
    .replace(/[\s。、，,.！!？?「」『』・…〜~:：;；—–-]/g, '')
    .replace(/[\u30a1-\u30f6]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 0x60),
    );
  const smallKana = new Set(Array.from('ゃゅょぁぃぅぇぉゎ'));
  const moras = [];
  for (const character of normalized) {
    if (smallKana.has(character) && moras.length) {
      moras[moras.length - 1] += character;
    } else {
      moras.push(character);
    }
  }
  return {
    moraCount: moras.length,
    moras,
    explicitLongVowels: Array.from(normalized).filter(
      (character) => character === 'ー',
    ).length,
    possibleLongVowels: (
      normalized.match(/おう|おお|えい|ええ|ああ|いい|うう/g) || []
    ).length,
    geminationCount: Array.from(normalized).filter(
      (character) => character === 'っ',
    ).length,
  };
}

function acousticPitchComparison(userF0, referenceF0) {
  if (
    !userF0 ||
    !referenceF0 ||
    userF0.voicedFrames < 5 ||
    referenceF0.voicedFrames < 5
  ) {
    return {
      status: 'unavailable',
      label: '暂时无法判断',
      reason: '有效音高帧不足',
      correlation: null,
    };
  }
  if (
    userF0.pitchRangeSemitones < 0.8 ||
    referenceF0.pitchRangeSemitones < 0.8
  ) {
    return {
      status: 'unavailable',
      label: '暂时无法判断',
      reason: '录音或标准音频的音高变化不足',
      correlation: null,
      userRangeSemitones: userF0.pitchRangeSemitones,
      referenceRangeSemitones: referenceF0.pitchRangeSemitones,
    };
  }

  const points = 32;
  const sampleContour = (values) =>
    Array.from({ length: points }, (_, index) => {
      const position = (index / Math.max(1, points - 1)) * (values.length - 1);
      const lower = Math.floor(position);
      const upper = Math.min(values.length - 1, lower + 1);
      const fraction = position - lower;
      return values[lower] * (1 - fraction) + values[upper] * fraction;
    });
  const left = sampleContour(userF0.relativeContour);
  const right = sampleContour(referenceF0.relativeContour);
  const leftMean = acousticMean(left);
  const rightMean = acousticMean(right);
  let numerator = 0;
  let leftSquares = 0;
  let rightSquares = 0;
  for (let index = 0; index < points; index += 1) {
    const a = left[index] - leftMean;
    const b = right[index] - rightMean;
    numerator += a * b;
    leftSquares += a * a;
    rightSquares += b * b;
  }
  const correlation =
    leftSquares && rightSquares
      ? numerator / Math.sqrt(leftSquares * rightSquares)
      : 0;

  if (correlation >= 0.45) {
    return {
      status: 'estimated',
      label: '基础音高走势可能接近参考',
      reason: '仅比较相对音高轮廓，未判断音高重音位置',
      correlation,
    };
  }
  if (correlation <= 0.05) {
    return {
      status: 'unavailable',
      label: '暂时无法可靠判断',
      reason: '音高走势相关性较低，但不足以认定发音错误',
      correlation,
    };
  }
  return {
    status: 'unavailable',
    label: '暂时无法判断',
    reason: '音高走势相关性处于模糊区间',
    correlation,
  };
}

function analyzeJapanesePronunciationAcoustics({
  samples,
  sampleRate,
  referenceFeatures,
  expectedReading,
}) {
  const user = acousticAnalyzeSignal(samples, sampleRate);
  const mora = acousticJapaneseMoras(expectedReading);
  const unavailable = (reason, label = '暂时无法判断') => ({
    status: 'unavailable',
    label,
    reason,
    confidence: 'low',
  });

  if (user.status !== 'ok' || !user.silence?.speechDurationSeconds) {
    return {
      schemaVersion: ACOUSTIC_ANALYSIS_SCHEMA_VERSION,
      status: 'unavailable',
      user,
      reference: referenceFeatures || null,
      mora,
      durationAnalysis: unavailable('用户录音没有可用于比较的语音段'),
      longVowels: unavailable('用户录音没有可用于比较的语音段'),
      gemination: unavailable('用户录音没有可用于比较的语音段'),
      pitch: unavailable('用户录音没有可用于比较的语音段'),
      disclaimer: '声学分析不能替代音素级或音高重音评分。',
    };
  }

  const referenceUsable =
    referenceFeatures?.status === 'ok' &&
    referenceFeatures.silence?.speechDurationSeconds > 0;
  const durationRatio = referenceUsable
    ? user.silence.speechDurationSeconds /
      referenceFeatures.silence.speechDurationSeconds
    : null;
  let durationAnalysis;
  if (durationRatio === null) {
    durationAnalysis = unavailable('缺少可用的标准音频');
  } else if (durationRatio < 0.7) {
    durationAnalysis = {
      status: 'estimated',
      label: '整体语速可能明显偏快或部分内容偏短',
      reason: '按有效语音时长比较参考音频',
      confidence: 'low',
      ratio: durationRatio,
    };
  } else if (durationRatio > 1.45) {
    durationAnalysis = {
      status: 'estimated',
      label: '整体语速可能明显偏慢或停顿较多',
      reason: '按有效语音时长比较参考音频',
      confidence: 'low',
      ratio: durationRatio,
    };
  } else {
    durationAnalysis = {
      status: 'estimated',
      label: '整体语速与参考接近',
      reason: '按有效语音时长比较参考音频',
      confidence: 'low',
      ratio: durationRatio,
    };
  }

  let longVowels;
  const hasLongVowelTarget =
    mora.explicitLongVowels > 0 || mora.possibleLongVowels > 0;
  if (!hasLongVowelTarget) {
    longVowels = {
      status: 'not-applicable',
      label: '目标文本未标记长音',
      reason: '没有可核对的长音位置',
      confidence: 'low',
    };
  } else if (!referenceUsable) {
    longVowels = unavailable('缺少可用的标准音频');
  } else if (durationRatio < 0.8) {
    longVowels = {
      status: 'unavailable',
      label: '长音可能偏短，但暂时无法定位',
      reason: '整句语音时长短于参考，尚不能确认问题在具体长音',
      confidence: 'low',
      ratio: durationRatio,
    };
  } else {
    longVowels = {
      status: 'unavailable',
      label: '暂时无法判断',
      reason: '目前只比较整句时长，尚未完成莫拉级对齐',
      confidence: 'low',
      ratio: durationRatio,
    };
  }

  let gemination;
  if (!mora.geminationCount) {
    gemination = {
      status: 'not-applicable',
      label: '目标文本中没有促音「っ」',
      reason: '没有可核对的促音位置',
      confidence: 'low',
    };
  } else if (!referenceUsable) {
    gemination = unavailable('缺少可用的标准音频');
  } else {
    const referenceGaps = referenceFeatures.silence.internalSilenceGaps.length;
    const userGaps = user.silence.internalSilenceGaps.length;
    if (referenceGaps > 0 && userGaps < referenceGaps) {
      gemination = {
        status: 'unavailable',
        label: '促音停顿可能不足，但暂时无法确认',
        reason: '用户录音的内部静音段少于标准音频',
        confidence: 'low',
        userGaps,
        referenceGaps,
      };
    } else if (userGaps > 0) {
      gemination = {
        status: 'unavailable',
        label: '检测到内部停顿，但暂时无法确认是促音',
        reason: '静音段可能来自换气或句间停顿',
        confidence: 'low',
        userGaps,
        referenceGaps,
      };
    } else {
      gemination = unavailable('暂未检测到可核对的促音停顿');
    }
  }

  return {
    schemaVersion: ACOUSTIC_ANALYSIS_SCHEMA_VERSION,
    status: 'analyzed',
    user,
    reference: referenceFeatures || null,
    mora,
    durationAnalysis,
    longVowels,
    gemination,
    pitch: acousticPitchComparison(user.f0, referenceFeatures?.f0),
    disclaimer:
      '当前只提供时长、能量、静音段和基础 F0 特征；长音、促音与音高结论均为低置信提示，不代表音素级准确率。',
  };
}
