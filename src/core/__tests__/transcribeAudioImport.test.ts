import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IMPORT_CHUNK_SECONDS } from '../audioImport';
import { audioImportChunkProgress, transcribeImportedAudioFile, type AudioImportProgress } from '../transcribeAudioImport';

vi.mock('../localStt', () => ({
  ensureLocalStt: vi.fn(async (onProgress?: (percent: number) => void) => {
    onProgress?.(100);
  }),
  transcribeImportedPcm: vi.fn(async () => 'the wind howled'),
}));

vi.mock('../audioImport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../audioImport')>();
  return {
    ...actual,
    decodeImportedAudio: vi.fn(),
  };
});

import { decodeImportedAudio } from '../audioImport';
import { transcribeImportedPcm } from '../localStt';

describe('audio import progress', () => {
  beforeEach(() => {
    vi.mocked(decodeImportedAudio).mockReset();
    vi.mocked(transcribeImportedPcm).mockReset();
    vi.mocked(transcribeImportedPcm).mockResolvedValue('the wind howled');
  });

  it('names each slice of a long take with clock times', () => {
    const first = audioImportChunkProgress(0, 3, 100_000);
    const last = audioImportChunkProgress(2, 3, 100_000);
    expect(first.label).toContain('part 1 of 3');
    expect(first.label).toContain('0:00');
    expect(first.label).toContain(`0:${String(IMPORT_CHUNK_SECONDS).padStart(2, '0')}`);
    expect(last.label).toContain('part 3 of 3');
    expect(last.fraction).toBeGreaterThan(first.fraction);
    expect(audioImportChunkProgress(0, 1, 12_000).label).toBe('Transcribing the take on this computer…');
  });

  it('reports decode, model, and per-chunk transcription while importing', async () => {
    const samples = new Float32Array(16_000 * 90);
    vi.mocked(decodeImportedAudio).mockResolvedValue({
      samples,
      sampleRate: 16_000,
      durationMs: 90_000,
    });
    const seen: AudioImportProgress[] = [];
    const result = await transcribeImportedAudioFile(new Uint8Array([1, 2, 3, 4]), 'audio/mp4', (step) => {
      seen.push(step);
    });
    expect(result.text).toBe('the wind howled the wind howled');
    expect(vi.mocked(transcribeImportedPcm).mock.calls).toHaveLength(2);
    expect(vi.mocked(transcribeImportedPcm).mock.calls[0]?.[2]).toBeUndefined();
    expect(seen.map((step) => step.label)).toEqual([
      'Decoding the audio file…',
      'Loading the speech model…',
      'Loading the speech model…',
      'Transcribing part 1 of 2 (0:00–0:45)…',
      'Transcribing part 2 of 2 (0:45–1:30)…',
      'Preparing the transcript…',
    ]);
    expect(seen[0]?.fraction).toBeLessThan(seen[seen.length - 1]?.fraction ?? 0);
    expect(seen[seen.length - 1]?.fraction).toBeGreaterThan(0.9);
  });

  it('feeds the book names into each imported chunk', async () => {
    vi.mocked(decodeImportedAudio).mockResolvedValue({
      samples: new Float32Array(16_000),
      sampleRate: 16_000,
      durationMs: 1_000,
    });
    await transcribeImportedAudioFile(new Uint8Array([1]), 'audio/mp4', undefined, 'Names: Kaeldros.');
    expect(vi.mocked(transcribeImportedPcm).mock.calls[0]?.[2]).toBe('Names: Kaeldros.');
  });
});
