import { describe, expect, it } from 'vitest';
import { cleanTranscript } from '../transcriptCleanup';
import { createDecodeQueue, shouldCommitDecoded, shouldSkipDecode, type ReadyUtterance } from '../speechUtterance';
import { useStore } from '../../store';
import { parseAudioCues } from '../audioCues';
import { appendSegments } from '../manuscript';

function utt(partial: Partial<ReadyUtterance> & Pick<ReadyUtterance, 'avgRms' | 'speechMs'>): ReadyUtterance {
  return {
    samples: partial.samples ?? new Float32Array([partial.avgRms]),
    sampleRate: 16_000,
    listening: true,
    ...partial,
  };
}

describe('dictation still reaches the certified manuscript', () => {
  it('keeps structure cues and does not treat them as silence filler', () => {
    const phrase = 'new chapter titled The Gate period the wind howled';
    expect(cleanTranscript(phrase)).toBe(phrase);
    expect(cleanTranscript('new paragraph')).toBe('new paragraph');
    expect(cleanTranscript('new scene')).toBe('new scene');
    expect(cleanTranscript('No, she said no.')).toBe('No, she said no.');
    expect(shouldCommitDecoded(phrase, { listening: true })).toBe(true);
    expect(shouldCommitDecoded('new paragraph', { listening: true })).toBe(true);
    expect(shouldSkipDecode(utt({ avgRms: 0.02, speechMs: 280 }))).toBe(false);
  });

  it('does not skip an in-flight job when a later utterance is waiting', async () => {
    const commits: string[] = [];
    const q = createDecodeQueue({
      transcribe: async (samples) => (samples[0] === 1 ? 'new paragraph' : 'The morning started. She kept walking.'),
      onText: (text) => commits.push(text),
    });
    q.submit(utt({ avgRms: 0.018, speechMs: 420, samples: new Float32Array([1]) }));
    q.submit(utt({ avgRms: 0.05, speechMs: 1400, samples: new Float32Array([2]) }));
    await q.idle();
    expect(commits).toEqual(['new paragraph', 'The morning started. She kept walking.']);
  });

  it('seals a spoken chapter and the prose that follows as dictation', () => {
    const bookId = useStore.getState().createBook('Gate', 'fantasy');
    useStore.getState().applyDictation(bookId, 'new chapter titled The Gate period the wind howled');
    const book = useStore.getState().books.find((b) => b.id === bookId);
    const blocks = book?.manuscript.blocks ?? [];
    expect(blocks.map((b) => b.type)).toEqual(['chapter', 'paragraph']);
    expect(blocks[0]?.title).toBe('The Gate');
    expect(blocks[1]?.text).toMatch(/wind howled/i);
    const points = book?.manuscript.certification?.points ?? [];
    expect(points.length).toBeGreaterThan(0);
    expect(points.every((point) => point.origin === 'dictation')).toBe(true);
    expect(points.some((point) => point.text.includes('The Gate'))).toBe(true);
    expect(points.some((point) => /wind howled/i.test(point.text))).toBe(true);
  });

  it('keeps a short scene cue and a following paragraph as structure', () => {
    const bookId = useStore.getState().createBook('Scene', 'generic');
    useStore.getState().applyDictation(bookId, 'new scene');
    useStore.getState().applyDictation(bookId, 'new paragraph She said no.');
    const blocks = useStore.getState().books.find((b) => b.id === bookId)?.manuscript.blocks ?? [];
    expect(blocks.some((b) => b.type === 'scene')).toBe(true);
    const paragraph = blocks.find((b) => b.type === 'paragraph');
    expect(paragraph?.text ?? '').toMatch(/no/i);
    const segs = parseAudioCues('new paragraph');
    expect(appendSegments([], segs).filter((b) => b.type === 'paragraph')).toEqual([]);
  });
});
