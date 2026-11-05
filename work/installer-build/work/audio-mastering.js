#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const AUDIO_DIR = path.join(PROJECT_ROOT, 'src', 'audio');
const METADATA_PATH = path.join(AUDIO_DIR, 'audio-metadata.json');

const PROFILE = 'trim-fade-normalize-v1';
const FRAME_SECONDS = 0.01;
const HEAD_PADDING_SECONDS = 0.1;
const TAIL_PADDING_SECONDS = 0.13;
const MIN_SILENCE_RMS = 0.002;
const SILENCE_RELATIVE_THRESHOLD = 0.04;
const FADE_SECONDS = 0.008;
const HIGHPASS_HZ = 75;
const TARGET_ACTIVE_RMS_DBFS = -20;
const PEAK_CEILING_DBFS = -1;
const MAX_GAIN = 4;

function dbToLinear(db) {
  return 10 ** (db / 20);
}

function linearToDb(value) {
  return 20 * Math.log10(Math.max(value, Number.EPSILON));
}

function parseWav(buffer) {
  if (
    buffer.length < 44 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('不是有效的 RIFF/WAVE 文件');
  }

  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;
    if (chunkEnd > buffer.length) {
      throw new Error(`WAV 分块 ${chunkId} 超出文件范围`);
    }
    if (chunkId === 'fmt ') {
      fmt = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        byteRate: buffer.readUInt32LE(chunkStart + 8),
        blockAlign: buffer.readUInt16LE(chunkStart + 12),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      };
    } else if (chunkId === 'data') {
      data = buffer.subarray(chunkStart, chunkEnd);
    }
    offset = chunkEnd + (chunkSize & 1);
  }

  if (!fmt || !data) {
    throw new Error('WAV 缺少 fmt 或 data 分块');
  }
  if (
    fmt.audioFormat !== 1 ||
    fmt.channels !== 1 ||
    fmt.bitsPerSample !== 16
  ) {
    throw new Error(
      `当前母带脚本只支持 16-bit 单声道 PCM，实际为 format=${fmt.audioFormat}, channels=${fmt.channels}, bits=${fmt.bitsPerSample}`,
    );
  }

  const sampleCount = Math.floor(data.length / 2);
  const samples = new Float64Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = data.readInt16LE(index * 2) / 32768;
  }

  return { ...fmt, samples };
}

function highPass(samples, sampleRate, cutoffHz = HIGHPASS_HZ) {
  if (!samples.length || !sampleRate || !cutoffHz) return samples;
  const output = new Float64Array(samples.length);
  const alpha = Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  let previousInput = 0;
  let previousOutput = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const input = samples[index];
    const current = alpha * (previousOutput + input - previousInput);
    output[index] = current;
    previousInput = input;
    previousOutput = current;
  }
  return output;
}

function frameRms(samples, frameLength) {
  const frames = [];
  for (let start = 0; start < samples.length; start += frameLength) {
    const end = Math.min(samples.length, start + frameLength);
    let sum = 0;
    for (let index = start; index < end; index += 1) {
      sum += samples[index] * samples[index];
    }
    frames.push(Math.sqrt(sum / Math.max(1, end - start)));
  }
  return frames;
}

function findActiveBounds(samples, sampleRate) {
  const frameLength = Math.max(1, Math.round(sampleRate * FRAME_SECONDS));
  const frames = frameRms(samples, frameLength);
  const peakRms = Math.max(...frames);
  const threshold = Math.max(
    MIN_SILENCE_RMS,
    peakRms * SILENCE_RELATIVE_THRESHOLD,
  );
  let firstFrame = -1;
  let lastFrame = -1;
  frames.forEach((rms, index) => {
    if (rms >= threshold) {
      if (firstFrame < 0) firstFrame = index;
      lastFrame = index;
    }
  });
  if (firstFrame < 0) {
    throw new Error('检测不到有效语音，拒绝处理全静音文件');
  }
  return {
    frameLength,
    threshold,
    firstFrame,
    lastFrame,
  };
}

function applyFade(samples, sampleRate) {
  const fadeLength = Math.min(
    Math.round(sampleRate * FADE_SECONDS),
    Math.floor(samples.length / 2),
  );
  if (fadeLength <= 0) return samples;
  for (let index = 0; index < fadeLength; index += 1) {
    const factor = index / fadeLength;
    samples[index] *= factor;
    samples[samples.length - 1 - index] *= factor;
  }
  return samples;
}

function masterSamples(samples, sampleRate) {
  const filtered = highPass(samples, sampleRate);
  const bounds = findActiveBounds(filtered, sampleRate);
  const headPadding = Math.round(sampleRate * HEAD_PADDING_SECONDS);
  const tailPadding = Math.round(sampleRate * TAIL_PADDING_SECONDS);
  const activeStart = bounds.firstFrame * bounds.frameLength;
  const activeEnd = Math.min(
    filtered.length,
    (bounds.lastFrame + 1) * bounds.frameLength,
  );
  const start = Math.max(0, activeStart - headPadding);
  const end = Math.min(filtered.length, activeEnd + tailPadding);
  const trimmed = filtered.slice(start, end);

  let activeEnergy = 0;
  let activeCount = 0;
  for (let index = activeStart; index < activeEnd; index += 1) {
    activeEnergy += filtered[index] * filtered[index];
    activeCount += 1;
  }
  const activeRms = Math.sqrt(activeEnergy / Math.max(1, activeCount));
  const rawGain =
    activeRms > 0
      ? dbToLinear(TARGET_ACTIVE_RMS_DBFS) / activeRms
      : 1;
  let peak = 0;
  for (const sample of trimmed) {
    peak = Math.max(peak, Math.abs(sample));
  }
  const gain = Math.min(
    MAX_GAIN,
    rawGain,
    peak > 0 ? dbToLinear(PEAK_CEILING_DBFS) / peak : MAX_GAIN,
  );

  let outputPeak = 0;
  let outputEnergy = 0;
  for (let index = 0; index < trimmed.length; index += 1) {
    trimmed[index] = Math.max(
      -1,
      Math.min(1, trimmed[index] * gain),
    );
    outputPeak = Math.max(outputPeak, Math.abs(trimmed[index]));
    outputEnergy += trimmed[index] * trimmed[index];
  }
  applyFade(trimmed, sampleRate);

  return {
    samples: trimmed,
    report: {
      originalDurationSeconds: samples.length / sampleRate,
      durationSeconds: trimmed.length / sampleRate,
      removedHeadSeconds: start / sampleRate,
      removedTailSeconds: (samples.length - end) / sampleRate,
      activeRmsDbfs: linearToDb(
        Math.sqrt(outputEnergy / Math.max(1, trimmed.length)),
      ),
      peakDbfs: linearToDb(outputPeak),
      gainDb: linearToDb(gain),
      threshold: bounds.threshold,
    },
  };
}

function encodeWav(samples, sampleRate) {
  const dataLength = samples.length * 2;
  const buffer = Buffer.allocUnsafe(44 + dataLength);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataLength, 40);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    buffer.writeInt16LE(
      value < 0 ? Math.round(value * 32768) : Math.round(value * 32767),
      44 + index * 2,
    );
  }
  return buffer;
}

function atomicWrite(filePath, buffer) {
  const temporaryPath = `${filePath}.mastering-${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, buffer);
  fs.renameSync(temporaryPath, filePath);
}

function loadMetadata() {
  return JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
}

function processFile(fileName, metadata, { apply = false } = {}) {
  const filePath = path.join(AUDIO_DIR, fileName);
  const original = fs.readFileSync(filePath);
  const wav = parseWav(original);
  const result = masterSamples(wav.samples, wav.sampleRate);
  const output = encodeWav(result.samples, wav.sampleRate);
  const entry = metadata.entries[fileName];
  if (apply) {
    atomicWrite(filePath, output);
    if (entry) {
      entry.durationSeconds = Number(
        result.report.durationSeconds.toFixed(3),
      );
      entry.sampleRate = wav.sampleRate;
      entry.channels = wav.channels;
      entry.fileBytes = output.length;
      entry.fileSha256 = crypto
        .createHash('sha256')
        .update(output)
        .digest('hex');
      entry.mastering = {
        profile: PROFILE,
        processedAt: new Date().toISOString(),
        ...Object.fromEntries(
          Object.entries(result.report).map(([key, value]) => [
            key,
            Number(value.toFixed(4)),
          ]),
        ),
      };
    }
  }
  return {
    fileName,
    inputBytes: original.length,
    outputBytes: output.length,
    ...result.report,
  };
}

function parseArgs(argv) {
  const args = {
    apply: false,
    limit: 0,
    id: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--apply') args.apply = true;
    else if (value === '--dry-run') args.apply = false;
    else if (value === '--limit') args.limit = Number(argv[++index]) || 0;
    else if (value === '--id') args.id = String(argv[++index] || '');
  }
  return args;
}

function selectFiles(metadata, args) {
  let names = Object.keys(metadata.entries)
    .filter((name) => name.endsWith('.wav'))
    .sort();
  if (args.id) {
    const pattern = new RegExp(args.id);
    names = names.filter((name) => pattern.test(name));
  }
  if (args.limit > 0) names = names.slice(0, args.limit);
  return names;
}

function summarize(reports) {
  const sum = (key) =>
    reports.reduce((total, report) => total + report[key], 0);
  const average = (key) => sum(key) / Math.max(1, reports.length);
  return {
    files: reports.length,
    inputBytes: reports.reduce(
      (total, report) => total + report.inputBytes,
      0,
    ),
    outputBytes: reports.reduce(
      (total, report) => total + report.outputBytes,
      0,
    ),
    averageOriginalSeconds: Number(
      average('originalDurationSeconds').toFixed(3),
    ),
    averageOutputSeconds: Number(average('durationSeconds').toFixed(3)),
    averageRemovedHeadSeconds: Number(
      average('removedHeadSeconds').toFixed(3),
    ),
    averageRemovedTailSeconds: Number(
      average('removedTailSeconds').toFixed(3),
    ),
    averageOutputPeakDbfs: Number(average('peakDbfs').toFixed(2)),
    averageOutputRmsDbfs: Number(average('activeRmsDbfs').toFixed(2)),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const metadata = loadMetadata();
  const names = selectFiles(metadata, args);
  if (!names.length) {
    throw new Error('没有匹配到待处理音频');
  }
  const reports = [];
  let failures = 0;
  for (let index = 0; index < names.length; index += 1) {
    const fileName = names[index];
    try {
      reports.push(processFile(fileName, metadata, { apply: args.apply }));
    } catch (error) {
      failures += 1;
      console.error(`${fileName}: ${error.message}`);
    }
    if ((index + 1) % 500 === 0 || index + 1 === names.length) {
      console.log(`已检查 ${index + 1}/${names.length}`);
    }
  }

  if (args.apply && reports.length) {
    metadata.updatedAt = new Date().toISOString();
    metadata.masteringProfile = PROFILE;
    atomicWrite(
      METADATA_PATH,
      Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, 'utf8'),
    );
  }

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'apply' : 'dry-run',
        profile: PROFILE,
        failures,
        summary: summarize(reports),
      },
      null,
      2,
    ),
  );
  if (failures > 0) process.exitCode = 1;
}

module.exports = {
  FRAME_SECONDS,
  HEAD_PADDING_SECONDS,
  PROFILE,
  TAIL_PADDING_SECONDS,
  encodeWav,
  highPass,
  masterSamples,
  parseWav,
};

if (require.main === module) {
  main();
}
