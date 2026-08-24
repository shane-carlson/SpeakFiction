/** Desktop import of voice memos and common audio files. Decode here, transcribe on-device. */

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
/** Decode in ~45s slices so a long memo still finishes on-device. */
export const IMPORT_CHUNK_SECONDS = 45;

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

export async function decodeImportedAudio(
  bytes: Uint8Array,
  _mime?: string,
): Promise<{ samples: Float32Array; sampleRate: number; durationMs: number }> {
  if (bytes.byteLength < 16) {
    throw new Error('That audio file is empty.');
  }
  if (bytes.byteLength > MAX_AUDIO_IMPORT_BYTES) {
    throw new Error('That audio file is too large to import (40 MB limit).');
  }
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) {
    throw new Error('This build cannot decode audio files.');
  }
  const ctx = new Ctx();
  try {
    const buffer = await ctx.decodeAudioData(copyToArrayBuffer(bytes));
    const samples = mixToMono(buffer);
    const durationMs = Math.round((samples.length / buffer.sampleRate) * 1000);
    return { samples, sampleRate: buffer.sampleRate, durationMs };
  } catch (err) {
    if (err instanceof Error && /too large|empty|cannot decode/i.test(err.message)) throw err;
    throw new Error('Could not decode that audio file. Try WAV, M4A, MP3, AAC, OGG, FLAC, or CAF.');
  } finally {
    void ctx.close();
  }
}
