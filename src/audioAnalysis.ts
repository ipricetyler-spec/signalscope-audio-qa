export type FindingSeverity = "critical" | "warning" | "info";

export interface AudioFinding {
  id: string;
  type: "clipping" | "silence" | "imbalance" | "dc-offset" | "channel-layout";
  severity: FindingSeverity;
  title: string;
  detail: string;
  startSeconds: number;
  durationSeconds: number;
}

export interface WaveformBucket { min: number; max: number; rms: number }

export interface AudioMetrics {
  durationSeconds: number;
  sampleRate: number;
  channelCount: number;
  peak: number;
  rms: number;
  crestFactorDb: number;
  dcOffset: number;
  clippedSamples: number;
  balanceDb: number | null;
  stereoCorrelation: number | null;
}

export interface AudioReport {
  version: 1;
  analyzedAt: string;
  qualityScore: number;
  metrics: AudioMetrics;
  findings: AudioFinding[];
  waveform: WaveformBucket[];
}

const EPSILON = 1e-12;
const CLIP_THRESHOLD = 0.99;
const SILENCE_THRESHOLD = 0.004;
const MIN_SILENCE_SECONDS = 0.45;

function validateChannels(channels: readonly ArrayLike<number>[], sampleRate: number): number {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new RangeError("Sample rate must be positive.");
  if (channels.length === 0) throw new RangeError("At least one audio channel is required.");
  const samples = channels[0]?.length ?? 0;
  if (samples === 0) throw new RangeError("Audio channels cannot be empty.");
  for (const channel of channels) {
    if (channel.length !== samples) throw new RangeError("All channels must have equal lengths.");
  }
  return samples;
}

function amplitudeToDb(value: number): number {
  return 20 * Math.log10(Math.max(value, EPSILON));
}

function summarizeWaveform(channels: readonly ArrayLike<number>[], samples: number, bucketCount: number): WaveformBucket[] {
  const count = Math.max(1, Math.min(bucketCount, samples));
  const buckets: WaveformBucket[] = [];
  for (let bucket = 0; bucket < count; bucket += 1) {
    const start = Math.floor(bucket * samples / count);
    const end = Math.max(start + 1, Math.floor((bucket + 1) * samples / count));
    let min = 1;
    let max = -1;
    let squares = 0;
    let read = 0;
    for (let i = start; i < end; i += 1) {
      let mono = 0;
      for (const channel of channels) mono += channel[i] ?? 0;
      mono /= channels.length;
      min = Math.min(min, mono);
      max = Math.max(max, mono);
      squares += mono * mono;
      read += 1;
    }
    buckets.push({ min, max, rms: Math.sqrt(squares / Math.max(1, read)) });
  }
  return buckets;
}

interface Region { start: number; end: number }

function findSilenceRegions(channels: readonly ArrayLike<number>[], samples: number, sampleRate: number): Region[] {
  const minimumSamples = Math.round(MIN_SILENCE_SECONDS * sampleRate);
  const regions: Region[] = [];
  let start = -1;
  for (let i = 0; i < samples; i += 1) {
    let amplitude = 0;
    for (const channel of channels) amplitude += Math.abs(channel[i] ?? 0);
    const silent = amplitude / channels.length < SILENCE_THRESHOLD;
    if (silent && start < 0) start = i;
    if ((!silent || i === samples - 1) && start >= 0) {
      const end = silent && i === samples - 1 ? i + 1 : i;
      if (end - start >= minimumSamples) regions.push({ start, end });
      start = -1;
    }
  }
  return regions;
}

function findClippingRegions(channels: readonly ArrayLike<number>[], samples: number, sampleRate: number): Region[] {
  const regions: Region[] = [];
  const mergeGap = Math.max(1, Math.round(sampleRate * 0.02));
  let regionStart = -1;
  let lastClip = -1;
  for (let i = 0; i < samples; i += 1) {
    let clipped = false;
    for (const channel of channels) clipped ||= Math.abs(channel[i] ?? 0) >= CLIP_THRESHOLD;
    if (clipped) {
      if (regionStart < 0) regionStart = i;
      lastClip = i;
    } else if (regionStart >= 0 && i - lastClip > mergeGap) {
      regions.push({ start: regionStart, end: lastClip + 1 });
      regionStart = -1;
      lastClip = -1;
    }
  }
  if (regionStart >= 0) regions.push({ start: regionStart, end: lastClip + 1 });
  return regions;
}

export function analyzeAudio(
  channels: readonly ArrayLike<number>[],
  sampleRate: number,
  analyzedAt = new Date().toISOString(),
): AudioReport {
  const samples = validateChannels(channels, sampleRate);
  const channelSquares = new Array<number>(channels.length).fill(0);
  const channelSums = new Array<number>(channels.length).fill(0);
  let peak = 0;
  let clippedSamples = 0;

  for (let i = 0; i < samples; i += 1) {
    let sampleClipped = false;
    for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
      const value = channels[channelIndex]?.[i] ?? 0;
      if (!Number.isFinite(value)) throw new TypeError("Audio samples must be finite numbers.");
      peak = Math.max(peak, Math.abs(value));
      sampleClipped ||= Math.abs(value) >= CLIP_THRESHOLD;
      channelSquares[channelIndex] = (channelSquares[channelIndex] ?? 0) + value * value;
      channelSums[channelIndex] = (channelSums[channelIndex] ?? 0) + value;
    }
    if (sampleClipped) clippedSamples += 1;
  }

  const channelRms = channelSquares.map((sum) => Math.sqrt(sum / samples));
  const rms = Math.sqrt(channelSquares.reduce((sum, value) => sum + value, 0) / (samples * channels.length));
  const dcOffset = channelSums.reduce((sum, value) => sum + value, 0) / (samples * channels.length);
  const balanceDb = channels.length >= 2
    ? amplitudeToDb(channelRms[1] ?? 0) - amplitudeToDb(channelRms[0] ?? 0)
    : null;

  let stereoCorrelation: number | null = null;
  if (channels.length >= 2) {
    let cross = 0;
    for (let i = 0; i < samples; i += 1) cross += (channels[0]?.[i] ?? 0) * (channels[1]?.[i] ?? 0);
    stereoCorrelation = cross / Math.sqrt(Math.max(EPSILON, (channelSquares[0] ?? 0) * (channelSquares[1] ?? 0)));
    stereoCorrelation = Math.max(-1, Math.min(1, stereoCorrelation));
  }

  const clippingRegions = findClippingRegions(channels, samples, sampleRate);
  const silenceRegions = findSilenceRegions(channels, samples, sampleRate);
  const findings: AudioFinding[] = [];

  clippingRegions.slice(0, 12).forEach((region, index) => findings.push({
    id: `clip-${index + 1}`,
    type: "clipping",
    severity: "critical",
    title: "Clipping detected",
    detail: "Samples reached or exceeded 99% of full scale and may sound distorted.",
    startSeconds: region.start / sampleRate,
    durationSeconds: Math.max(1 / sampleRate, (region.end - region.start) / sampleRate),
  }));

  silenceRegions.slice(0, 12).forEach((region, index) => findings.push({
    id: `silence-${index + 1}`,
    type: "silence",
    severity: "warning",
    title: "Extended silence",
    detail: `Signal remained below ${amplitudeToDb(SILENCE_THRESHOLD).toFixed(0)} dBFS for at least ${MIN_SILENCE_SECONDS}s.`,
    startSeconds: region.start / sampleRate,
    durationSeconds: (region.end - region.start) / sampleRate,
  }));

  if (balanceDb !== null && Math.abs(balanceDb) > 3) findings.push({
    id: "channel-imbalance",
    type: "imbalance",
    severity: "warning",
    title: "Stereo channel imbalance",
    detail: `${balanceDb > 0 ? "Right" : "Left"} channel is ${Math.abs(balanceDb).toFixed(1)} dB louder on average.`,
    startSeconds: 0,
    durationSeconds: samples / sampleRate,
  });

  if (Math.abs(dcOffset) > 0.02) findings.push({
    id: "dc-offset",
    type: "dc-offset",
    severity: "warning",
    title: "Possible DC offset",
    detail: `Average signal offset is ${(dcOffset * 100).toFixed(2)}%; consider a DC-removal filter.`,
    startSeconds: 0,
    durationSeconds: samples / sampleRate,
  });

  if (channels.length === 1) findings.push({
    id: "mono-source",
    type: "channel-layout",
    severity: "info",
    title: "Mono source",
    detail: "Stereo balance and correlation checks are unavailable for a single-channel file.",
    startSeconds: 0,
    durationSeconds: samples / sampleRate,
  });

  let qualityScore = 100;
  if (clippingRegions.length > 0) qualityScore -= Math.min(40, 18 + clippingRegions.length * 4);
  qualityScore -= Math.min(24, silenceRegions.length * 6);
  if (balanceDb !== null && Math.abs(balanceDb) > 3) qualityScore -= 12;
  if (Math.abs(dcOffset) > 0.02) qualityScore -= 10;

  return {
    version: 1,
    analyzedAt,
    qualityScore: Math.max(0, qualityScore),
    metrics: {
      durationSeconds: samples / sampleRate,
      sampleRate,
      channelCount: channels.length,
      peak,
      rms,
      crestFactorDb: amplitudeToDb(peak) - amplitudeToDb(rms),
      dcOffset,
      clippedSamples,
      balanceDb,
      stereoCorrelation,
    },
    findings: findings.sort((a, b) => a.startSeconds - b.startSeconds || a.id.localeCompare(b.id)),
    waveform: summarizeWaveform(channels, samples, 700),
  };
}

export function createDemoAudio(sampleRate = 48_000, durationSeconds = 8): Float32Array[] {
  const length = Math.round(sampleRate * durationSeconds);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const time = i / sampleRate;
    const envelope = Math.min(1, time * 8, (durationSeconds - time) * 8);
    const base = Math.sin(2 * Math.PI * 220 * time) * 0.34 * Math.max(0, envelope);
    const silent = time >= 2.15 && time < 2.85;
    const clipping = time >= 5.4 && time < 5.65;
    left[i] = silent ? 0 : clipping ? Math.max(-1, Math.min(1, base * 5)) : base;
    right[i] = silent ? 0 : clipping ? Math.max(-1, Math.min(1, base * 4)) : base * 0.48;
  }
  return [left, right];
}
