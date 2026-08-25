import { decodeImportedAudio, IMPORT_CHUNK_SECONDS, slicePcmChunks } from './audioImport';
import { ensureLocalStt, transcribeImportedPcm } from './localStt';

export type AudioImportProgress = {
  fraction: number;
  label: string;
};

export type AudioImportProgressHandler = (progress: AudioImportProgress) => void;

function clampFraction(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function audioImportChunkProgress(
  index: number,
  total: number,
  durationMs: number,
  chunkSeconds = IMPORT_CHUNK_SECONDS,
): AudioImportProgress {
  const count = Math.max(1, total);
  const startMs = index * chunkSeconds * 1000;
  const endMs = Math.min(Math.max(durationMs, startMs + 80), startMs + chunkSeconds * 1000);
  const fraction = clampFraction(0.18 + ((index + 0.12) / count) * 0.74);
  if (count === 1) {
    return { fraction, label: 'Transcribing the take on this computer…' };
  }
  return {
    fraction,
    label: `Transcribing part ${index + 1} of ${count} (${formatClock(startMs)}–${formatClock(endMs)})…`,
  };
}

export async function transcribeImportedAudioFile(
  bytes: Uint8Array,
  mime?: string,
  onProgress?: AudioImportProgressHandler,
): Promise<{ text: string; durationMs: number }> {
  onProgress?.({ fraction: 0.06, label: 'Decoding the audio file…' });
  const decoded = await decodeImportedAudio(bytes, mime);
  onProgress?.({ fraction: 0.12, label: 'Loading the speech model…' });
  await ensureLocalStt((percent) => {
    onProgress?.({
      fraction: clampFraction(0.12 + (Math.min(100, Math.max(0, percent)) / 100) * 0.06),
      label: 'Loading the speech model…',
    });
  });
  const chunks = slicePcmChunks(decoded.samples, decoded.sampleRate);
  const parts: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(audioImportChunkProgress(i, chunks.length, decoded.durationMs));
    const text = (await transcribeImportedPcm(chunks[i], decoded.sampleRate)).trim();
    if (text) parts.push(text);
  }
  onProgress?.({ fraction: 0.94, label: 'Preparing the transcript…' });
  return { text: parts.join(' ').replace(/\s+/g, ' ').trim(), durationMs: decoded.durationMs };
}
