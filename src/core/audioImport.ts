/** Desktop import of voice memos and common audio files. Decode here, transcribe on-device. */

import { peekImportedAudioDurationMs } from './audioImportDuration';

export const AUDIO_IMPORT_EXTENSIONS = [
  'wav',
  'wave',
  'mp3',
  'm4a',
  'aac',
  'caf',
  'ogg',
  'oga',
  'opus',
  'flac',
  'webm',
  'mp4',
  '3gp',
] as const;

export const AUDIO_IMPORT_FILTERS = [
  {
    name: 'Audio',
    extensions: [...AUDIO_IMPORT_EXTENSIONS],
  },
];

export const AUDIO_IMPORT_ACCEPT = AUDIO_IMPORT_EXTENSIONS.map((ext) => `.${ext}`).join(',');

const MIME_BY_EXT: Record<string, string> = {
  wav: 'audio/wav',
  wave: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  caf: 'audio/x-caf',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  webm: 'audio/webm',
  mp4: 'audio/mp4',
  '3gp': 'audio/3gpp',
};

export const MAX_AUDIO_IMPORT_BYTES = 40 * 1024 * 1024;
/** Decoded takes longer than this OOMs Chromium while Web Audio expands the file. */
export const MAX_AUDIO_IMPORT_DURATION_MS = 20 * 60 * 1000;
/** Decode in ~45s slices so a long memo still finishes on-device. */
export const IMPORT_CHUNK_SECONDS = 45;
export const AUDIO_IMPORT_TOO_LARGE_MESSAGE = 'That audio file is too large to import (40 MB limit).';
export const AUDIO_IMPORT_TOO_LONG_MESSAGE =
  'That audio file is longer than 20 minutes. Split it into a shorter take and import that.';

export function importedAudioTooLargeMessage(byteLength: number): string | null {
  if (!Number.isFinite(byteLength) || byteLength <= MAX_AUDIO_IMPORT_BYTES) return null;
  return AUDIO_IMPORT_TOO_LARGE_MESSAGE;
}

export function importedAudioTooLongMessage(durationMs: number): string | null {
  if (!Number.isFinite(durationMs) || durationMs <= MAX_AUDIO_IMPORT_DURATION_MS) return null;
  return AUDIO_IMPORT_TOO_LONG_MESSAGE;
}

/** Keep the size and length warnings; rewrite only unexpected decoder failures. */
export function preservedAudioImportError(err: unknown): Error | null {
  if (!(err instanceof Error)) return null;
  if (/too large|empty|cannot decode|longer than/i.test(err.message)) return err;
  return null;
}

export function audioExtension(name: string | undefined): string {
  if (!name) return '';
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function isAudioImportName(name: string | undefined): boolean {
  return AUDIO_IMPORT_EXTENSIONS.includes(audioExtension(name) as (typeof AUDIO_IMPORT_EXTENSIONS)[number]);
}

export function mimeForAudioImport(name: string | undefined, fallback = ''): string {
  return MIME_BY_EXT[audioExtension(name)] || fallback;
}

export function mixToMono(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  if (channels < 1 || length < 1) return new Float32Array(0);
  if (channels === 1) return buffer.getChannelData(0).slice();
  const out = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) out[i] += data[i];
  }
  const inv = 1 / channels;
  for (let i = 0; i < length; i++) out[i] *= inv;
  return out;
}

export function slicePcmChunks(
  samples: Float32Array,
  sampleRate: number,
  chunkSeconds = IMPORT_CHUNK_SECONDS,
): Float32Array[] {
  const size = Math.max(1, Math.floor(sampleRate * chunkSeconds));
  if (samples.length <= size) return [samples];
  const chunks: Float32Array[] = [];
  for (let i = 0; i < samples.length; i += size) {
    chunks.push(samples.subarray(i, Math.min(i + size, samples.length)));
  }
  return chunks;
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function durationBeforeDecode(bytes: Uint8Array, mime?: string): Promise<number | null> {
  const peeked = peekImportedAudioDurationMs(bytes);
  if (peeked != null) return peeked;
  return probeAudioElementDurationMs(bytes, mime);
}

/** Metadata duration. Does not decode the whole take into PCM. */
export function probeAudioElementDurationMs(bytes: Uint8Array, mime?: string): Promise<number | null> {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    return Promise.resolve(null);
  }
  if (typeof URL.createObjectURL !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    if (typeof audio.canPlayType !== 'function') {
      resolve(null);
      return;
    }
    let settled = false;
    let url = '';
    const finish = (ms: number | null) => {
      if (settled) return;
      settled = true;
      if (url) URL.revokeObjectURL(url);
      audio.removeAttribute('src');
      resolve(ms);
    };
    try {
      url = URL.createObjectURL(new Blob([copyToArrayBuffer(bytes)], { type: mime || 'application/octet-stream' }));
    } catch {
      finish(null);
      return;
    }
    const timer = window.setTimeout(() => finish(null), 800);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      window.clearTimeout(timer);
      const duration = audio.duration;
      finish(Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : null);
    };
    audio.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    audio.src = url;
  });
}

export async function decodeImportedAudio(
  bytes: Uint8Array,
  mime?: string,
): Promise<{ samples: Float32Array; sampleRate: number; durationMs: number }> {
  if (bytes.byteLength < 16) {
    throw new Error('That audio file is empty.');
  }
  const tooLarge = importedAudioTooLargeMessage(bytes.byteLength);
  if (tooLarge) throw new Error(tooLarge);
  const hinted = await durationBeforeDecode(bytes, mime);
  if (hinted != null) {
    const tooLong = importedAudioTooLongMessage(hinted);
    if (tooLong) throw new Error(tooLong);
  }
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) {
    throw new Error('This build cannot decode audio files.');
  }
  const ctx = new Ctx();
  try {
    const buffer = await ctx.decodeAudioData(copyToArrayBuffer(bytes));
    const fromHeader = Number.isFinite(buffer.duration) ? Math.round(buffer.duration * 1000) : 0;
    const fromSamples =
      buffer.sampleRate > 0 ? Math.round((buffer.length / buffer.sampleRate) * 1000) : 0;
    const durationMs = Math.max(fromHeader, fromSamples);
    const tooLong = importedAudioTooLongMessage(durationMs);
    if (tooLong) throw new Error(tooLong);
    const samples = mixToMono(buffer);
    return { samples, sampleRate: buffer.sampleRate, durationMs };
  } catch (err) {
    const preserved = preservedAudioImportError(err);
    if (preserved) throw preserved;
    throw new Error('Could not decode that audio file. Try WAV, M4A, MP3, AAC, OGG, FLAC, or CAF.');
  } finally {
    try {
      void Promise.resolve(ctx.close()).catch(() => undefined);
    } catch {
      /* Closing a failed context must not become an unhandled rejection. */
    }
  }
}
