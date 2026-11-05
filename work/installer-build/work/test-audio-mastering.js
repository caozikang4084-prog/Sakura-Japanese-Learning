const assert = require('assert');
const {
  FRAME_SECONDS,
  HEAD_PADDING_SECONDS,
  TAIL_PADDING_SECONDS,
  encodeWav,
  masterSamples,
  parseWav,
} = require('./audio-mastering');

function wavRoundTrip(sampleRate = 22050) {
  const samples = new Float64Array(sampleRate * 2);
  const speechStart = Math.round(sampleRate * 0.6);
  const speechEnd = Math.round(sampleRate * 1.2);
  for (let index = speechStart; index < speechEnd; index += 1) {
    const time = (index - speechStart) / sampleRate;
    const envelope = Math.sin(
      Math.PI * ((index - speechStart) / (speechEnd - speechStart)),
    );
    samples[index] =
      0.08 * envelope * Math.sin(2 * Math.PI * 180 * time);
  }

  const buffer = encodeWav(samples, sampleRate);
  const parsed = parseWav(buffer);
  assert.strictEqual(parsed.sampleRate, sampleRate);
  assert.strictEqual(parsed.channels, 1);
  assert.strictEqual(parsed.bitsPerSample, 16);
  assert.ok(Math.abs(parsed.samples.length - samples.length) <= 1);
}

function trimsSilenceAndAddsControlledPadding(sampleRate = 16000) {
  const samples = new Float64Array(sampleRate * 3);
  const speechStart = Math.round(sampleRate * 1);
  const speechEnd = Math.round(sampleRate * 1.5);
  for (let index = speechStart; index < speechEnd; index += 1) {
    samples[index] =
      0.05 * Math.sin((2 * Math.PI * 160 * (index - speechStart)) / sampleRate);
  }
  const result = masterSamples(samples, sampleRate);
  const expectedMaximum =
    speechEnd -
    speechStart +
    Math.round(
      (HEAD_PADDING_SECONDS + TAIL_PADDING_SECONDS + FRAME_SECONDS) *
        sampleRate,
    );
  assert.ok(result.samples.length <= expectedMaximum + 20);
  assert.ok(result.samples.length >= speechEnd - speechStart);
  assert.ok(result.report.peakDbfs <= -0.95);
  assert.ok(result.report.durationSeconds < 1);
}

function rejectsAllSilence() {
  assert.throws(
    () => masterSamples(new Float64Array(22050), 22050),
    /全静音/,
  );
}

function preservesSpeakersAboveSupportedRate() {
  wavRoundTrip(48000);
}

wavRoundTrip();
trimsSilenceAndAddsControlledPadding();
rejectsAllSilence();
preservesSpeakersAboveSupportedRate();
console.log('audio mastering tests: 4 passed, 0 failed');
