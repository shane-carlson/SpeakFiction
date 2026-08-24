import { decodeImportedAudio, slicePcmChunks } from './audioImport';
import { transcribeImportedPcm } from './localStt';

export async function transcribeImportedAudioFile(
  bytes: Uint8Array,
  mime?: string,
): Promise<{ text: string; durationMs: number }> {
  const decoded = await decodeImportedAudio(bytes, mime);
  const chunks = slicePcmChunks(decoded.samples, decoded.sampleRate);
  const parts: string[] = [];
  for (const chunk of chunks) {
    const text = (await transcribeImportedPcm(chunk, decoded.sampleRate)).trim();
    if (text) parts.push(text);
  }
  return { text: parts.join(' ').replace(/\s+/g, ' ').trim(), durationMs: decoded.durationMs };
}
