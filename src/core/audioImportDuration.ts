/**
 * Container duration for audio import.
 * Reads headers only — never expands the file into PCM.
 */

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i] ?? 0);
  return out;
}

function u16le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function u32le(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16) |
      ((bytes[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

function u32be(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function u64le(bytes: Uint8Array, offset: number): number {
  let value = 0;
  for (let i = 0; i < 8; i++) value += (bytes[offset + i] ?? 0) * 2 ** (8 * i);
  return value;
}

/** Milliseconds from a container header, or null when this buffer is not a known container. */
export function peekImportedAudioDurationMs(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 12) return null;
  return (
    peekWavDurationMs(bytes) ??
    peekFlacDurationMs(bytes) ??
    peekCafDurationMs(bytes) ??
    peekOggDurationMs(bytes) ??
    peekIsoDurationMs(bytes) ??
    peekMp3DurationMs(bytes) ??
    peekAdtsDurationMs(bytes)
  );
}

function peekWavDurationMs(bytes: Uint8Array): number | null {
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') return null;
  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, 4);
    const size = u32le(bytes, offset + 4);
    const start = offset + 8;
    if (id === 'fmt ' && size >= 16 && start + 12 <= bytes.length) {
      byteRate = u32le(bytes, start + 8);
    } else if (id === 'data') {
      dataSize = size;
      break;
    }
    if (size > bytes.length) break;
    const next = start + size + (size % 2);
    if (next <= offset) break;
    offset = next;
  }
  if (!byteRate || !dataSize) return null;
  return Math.round((dataSize / byteRate) * 1000);
}

function peekFlacDurationMs(bytes: Uint8Array): number | null {
  if (ascii(bytes, 0, 4) !== 'fLaC' || bytes.length < 42) return null;
  const type = bytes[4] & 0x7f;
  if (type !== 0) return null;
  const info = 8;
  const sampleRate = ((bytes[info + 10] ?? 0) << 12) | ((bytes[info + 11] ?? 0) << 4) | ((bytes[info + 12] ?? 0) >> 4);
  const totalSamples =
    ((bytes[info + 13] ?? 0) & 0x0f) * 4294967296 +
    (bytes[info + 14] ?? 0) * 16777216 +
    (bytes[info + 15] ?? 0) * 65536 +
    (bytes[info + 16] ?? 0) * 256 +
    (bytes[info + 17] ?? 0);
  if (!sampleRate || !totalSamples) return null;
  return Math.round((totalSamples / sampleRate) * 1000);
}

function peekCafDurationMs(bytes: Uint8Array): number | null {
  if (ascii(bytes, 0, 4) !== 'caff' || bytes.length < 8) return null;
  let offset = 8;
  let sampleRate = 0;
  let bytesPerPacket = 0;
  let framesPerPacket = 0;
  let dataBytes = 0;
  while (offset + 12 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const size = u64le(bytes, offset + 4);
    const start = offset + 12;
    if (type === 'desc' && start + 32 <= bytes.length) {
      sampleRate = readF64be(bytes, start);
      bytesPerPacket = u32be(bytes, start + 16);
      framesPerPacket = u32be(bytes, start + 20);
    } else if (type === 'data') {
      dataBytes = Math.max(0, size - 4);
      break;
    }
    if (!Number.isFinite(size) || size < 0) break;
    const next = start + size;
    if (next <= offset) break;
    if (next > bytes.length) break;
    offset = next;
  }
  if (!sampleRate || !bytesPerPacket || !framesPerPacket || !dataBytes) return null;
  const packets = dataBytes / bytesPerPacket;
  return Math.round(((packets * framesPerPacket) / sampleRate) * 1000);
}

function readF64be(bytes: Uint8Array, offset: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  return view.getFloat64(0, false);
}

function peekOggDurationMs(bytes: Uint8Array): number | null {
  if (ascii(bytes, 0, 4) !== 'OggS') return null;
  let offset = 0;
  let sampleRate = 0;
  let opus = false;
  let preSkip = 0;
  let lastGranule = 0;
  while (offset + 27 <= bytes.length) {
    if (ascii(bytes, offset, 4) !== 'OggS') return sampleRate && lastGranule ? durationFromGranule(lastGranule, sampleRate, opus, preSkip) : null;
    const granuleBytes = bytes.subarray(offset + 6, offset + 14);
    const granuleUnknown = granuleBytes.every((b) => b === 0xff);
    const granule = granuleUnknown ? 0 : u64le(bytes, offset + 6);
    if (granule > lastGranule) lastGranule = granule;
    const segments = bytes[offset + 26] ?? 0;
    if (offset + 27 + segments > bytes.length) break;
    let bodyBytes = 0;
    for (let i = 0; i < segments; i++) bodyBytes += bytes[offset + 27 + i] ?? 0;
    const body = offset + 27 + segments;
    if (!sampleRate && body + 8 <= bytes.length) {
      if ((bytes[body] ?? 0) === 1 && ascii(bytes, body + 1, 6) === 'vorbis' && body + 16 <= bytes.length) {
        sampleRate = u32le(bytes, body + 12);
      } else if (ascii(bytes, body, 8) === 'OpusHead') {
        opus = true;
        sampleRate = 48000;
        preSkip = u16le(bytes, body + 10);
      }
    }
    const next = body + bodyBytes;
    if (next <= offset) break;
    offset = next;
  }
  if (!sampleRate || !lastGranule) return null;
  return durationFromGranule(lastGranule, sampleRate, opus, preSkip);
}

function durationFromGranule(granule: number, sampleRate: number, opus: boolean, preSkip: number): number | null {
  const samples = opus ? Math.max(0, granule - preSkip) : granule;
  if (!samples || !sampleRate) return null;
  return Math.round((samples / sampleRate) * 1000);
}

function peekIsoDurationMs(bytes: Uint8Array): number | null {
  const type = ascii(bytes, 4, 4);
  if (type !== 'ftyp' && type !== 'moov' && type !== 'mdat' && type !== 'free' && type !== 'wide' && type !== 'skip') {
    return null;
  }
  return walkIso(bytes, 0, bytes.length, 0);
}

function walkIso(bytes: Uint8Array, start: number, end: number, depth: number): number | null {
  if (depth > 6) return null;
  let offset = start;
  let fallback: number | null = null;
  while (offset + 8 <= end) {
    let size = u32be(bytes, offset);
    const box = ascii(bytes, offset + 4, 4);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) return fallback;
      size = u32be(bytes, offset + 8) * 4294967296 + u32be(bytes, offset + 12);
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (!Number.isFinite(size) || size < header) return fallback;
    const next = offset + size;
    if (next <= offset || next > end) return fallback;
    if (box === 'mvhd') {
      const duration = readMvhd(bytes, offset + header, next);
      if (duration != null) return duration;
    } else if (box === 'moov' || box === 'trak' || box === 'mdia') {
      const duration = walkIso(bytes, offset + header, next, depth + 1);
      if (box === 'moov' && duration != null) return duration;
      if (duration != null) fallback = duration;
    }
    offset = next;
  }
  return fallback;
}

function readMvhd(bytes: Uint8Array, start: number, end: number): number | null {
  if (start >= end) return null;
  const version = bytes[start] ?? 0;
  if (version === 0) {
    if (start + 20 > end) return null;
    const timescale = u32be(bytes, start + 12);
    const duration = u32be(bytes, start + 16);
    if (!timescale || !duration) return null;
    return Math.round((duration / timescale) * 1000);
  }
  if (version === 1) {
    if (start + 32 > end) return null;
    const timescale = u32be(bytes, start + 20);
    const duration = u32be(bytes, start + 24) * 4294967296 + u32be(bytes, start + 28);
    if (!timescale || !duration) return null;
    return Math.round((duration / timescale) * 1000);
  }
  return null;
}

const MPEG1_BITRATE = [
  [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0],
  [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0],
  [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
];
const MPEG2_BITRATE = [
  [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0],
  [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
];
const MPEG_SAMPLE_RATES = [
  [11025, 12000, 8000],
  [0, 0, 0],
  [22050, 24000, 16000],
  [44100, 48000, 32000],
];

interface Mp3Frame {
  offset: number;
  frameLength: number;
  sampleRate: number;
  samplesPerFrame: number;
  mpeg1: boolean;
  channelMode: number;
}

function parseMp3Frame(bytes: Uint8Array, offset: number, end: number): Mp3Frame | null {
  if (offset + 4 > end) return null;
  if (bytes[offset] !== 0xff || ((bytes[offset + 1] ?? 0) & 0xe0) !== 0xe0) return null;
  const version = ((bytes[offset + 1] ?? 0) >> 3) & 0x3;
  const layerBits = ((bytes[offset + 1] ?? 0) >> 1) & 0x3;
  if (version === 1 || layerBits === 0) return null;
  const layerIndex = layerBits === 3 ? 0 : layerBits === 2 ? 1 : 2;
  const bitrateIndex = ((bytes[offset + 2] ?? 0) >> 4) & 0xf;
  const sampleIndex = ((bytes[offset + 2] ?? 0) >> 2) & 0x3;
  const padding = ((bytes[offset + 2] ?? 0) >> 1) & 0x1;
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3) return null;
  const mpeg1 = version === 3;
  const bitrate = (mpeg1 ? MPEG1_BITRATE : MPEG2_BITRATE)[layerIndex]?.[bitrateIndex] ?? 0;
  const sampleRate = MPEG_SAMPLE_RATES[version]?.[sampleIndex] ?? 0;
  if (!bitrate || !sampleRate) return null;
  const samplesPerFrame = layerIndex === 0 ? 384 : mpeg1 ? 1152 : 576;
  const coefficient = samplesPerFrame / 8;
  const frameLength = Math.floor((coefficient * bitrate * 1000) / sampleRate) + padding;
  if (frameLength < 4 || offset + frameLength > end) return null;
  return {
    offset,
    frameLength,
    sampleRate,
    samplesPerFrame,
    mpeg1,
    channelMode: ((bytes[offset + 3] ?? 0) >> 6) & 0x3,
  };
}

function readXingFrames(bytes: Uint8Array, frame: Mp3Frame): number | null {
  const side = frame.mpeg1 ? (frame.channelMode === 3 ? 17 : 32) : frame.channelMode === 3 ? 9 : 17;
  const at = frame.offset + 4 + side;
  if (at + 12 > bytes.length) return null;
  const tag = ascii(bytes, at, 4);
  if (tag !== 'Xing' && tag !== 'Info') return null;
  const flags = u32be(bytes, at + 4);
  if ((flags & 1) === 0) return null;
  const frames = u32be(bytes, at + 8);
  return frames > 0 ? frames : null;
}

function peekMp3DurationMs(bytes: Uint8Array): number | null {
  let offset = 0;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    if (bytes.length < 10) return null;
    const size =
      ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    offset = 10 + size;
  } else if (!(bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
    return null;
  }
  const end = bytes.length >= 128 && ascii(bytes, bytes.length - 128, 3) === 'TAG' ? bytes.length - 128 : bytes.length;
  const first = parseMp3Frame(bytes, offset, end);
  if (!first) return null;
  const xing = readXingFrames(bytes, first);
  if (xing) return Math.round(((xing * first.samplesPerFrame) / first.sampleRate) * 1000);

  let frames = 0;
  let cursor = offset;
  let sampleRate = first.sampleRate;
  let samplesPerFrame = first.samplesPerFrame;
  while (cursor + 4 <= end && frames < 2_000_000) {
    const frame = parseMp3Frame(bytes, cursor, end);
    if (!frame) break;
    frames += 1;
    sampleRate = frame.sampleRate;
    samplesPerFrame = frame.samplesPerFrame;
    cursor += frame.frameLength;
  }
  if (!frames || cursor < end - 4) return null;
  return Math.round(((frames * samplesPerFrame) / sampleRate) * 1000);
}

const ADTS_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

function peekAdtsDurationMs(bytes: Uint8Array): number | null {
  if (bytes.length < 7 || bytes[0] !== 0xff || ((bytes[1] ?? 0) & 0xf0) !== 0xf0) return null;
  if (((bytes[1] ?? 0) & 0x06) !== 0) return null;
  const rateIndex = ((bytes[2] ?? 0) >> 2) & 0xf;
  const sampleRate = ADTS_RATES[rateIndex] ?? 0;
  if (!sampleRate) return null;
  let offset = 0;
  let frames = 0;
  while (offset + 7 <= bytes.length && frames < 2_000_000) {
    if (bytes[offset] !== 0xff || ((bytes[offset + 1] ?? 0) & 0xf0) !== 0xf0) break;
    const length = (((bytes[offset + 3] ?? 0) & 0x03) << 11) | ((bytes[offset + 4] ?? 0) << 3) | ((bytes[offset + 5] ?? 0) >> 5);
    if (length < 7 || offset + length > bytes.length) break;
    frames += 1;
    offset += length;
  }
  if (!frames || offset < bytes.length - 7) return null;
  return Math.round(((frames * 1024) / sampleRate) * 1000);
}
