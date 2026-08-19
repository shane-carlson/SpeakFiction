import { afterEach, describe, expect, it } from 'vitest';
import { joinDraft, joinDraftAt, draftText, plainDraft, takeInsertTranscript } from '../dictationDraft';
import type { ManuscriptInsertAt } from '../manuscript';
import { useStore } from '../../store';

function promote(bookId: string, dest?: ManuscriptInsertAt) {
  const draft = useStore.getState().dictationDrafts[bookId] ?? [];
  const { transcript, remaining } = takeInsertTranscript(draft);
  if (!transcript) return;
  useStore.getState().applyDictation(bookId, transcript, dest);
  useStore.getState().setDictationDraft(bookId, remaining);
}

describe('applyDictation', () => {
  const created: string[] = [];

  afterEach(() => {
    while (created.length) {
      const id = created.pop();
      if (id) useStore.getState().deleteBook(id);
    }
  });

  it('keeps live speech in the transcription box until promote', () => {
    const bookId = useStore.getState().createBook('Staging buffer test', 'fantasy');
    created.push(bookId);

    const spoken = joinDraft([], 'the wind howled period');
    useStore.getState().setDictationDraft(bookId, spoken);

    expect(useStore.getState().dictationDrafts[bookId]).toEqual(spoken);
    const blocks = useStore.getState().books.find((b) => b.id === bookId)?.manuscript.blocks ?? [];
    expect(blocks).toEqual([]);
  });

  it('does not write the manuscript when landing dictation in the transcription box', () => {
    const bookId = useStore.getState().createBook('Transcript-first test', 'fantasy');
    created.push(bookId);

    const landed = joinDraftAt(plainDraft('Hello. World.'), 'the wind howled', 7);
    useStore.getState().setDictationDraft(bookId, landed);

    expect(draftText(landed)).toBe('Hello. the wind howled World.');
    expect(useStore.getState().books.find((b) => b.id === bookId)?.manuscript.blocks ?? []).toEqual([]);
  });

  it('inserts at the chosen manuscript index and clears the transcription box', () => {
    const bookId = useStore.getState().createBook('Insert draft test', 'fantasy');
    created.push(bookId);

    useStore.getState().applyDictation(bookId, 'Before period');
    const seeded = useStore.getState().books.find((b) => b.id === bookId);
    expect(seeded?.manuscript.blocks).toHaveLength(1);
    expect(seeded?.manuscript.blocks[0].text).toMatch(/Before/i);

    const draft = [
      { text: 'the wind howled period ', struck: false },
      { text: 'scratch this.', struck: true },
    ];
    useStore.getState().setDictationDraft(bookId, draft);

    const { transcript, remaining } = takeInsertTranscript(
      useStore.getState().dictationDrafts[bookId],
    );
    expect(transcript).toMatch(/the wind howled period/i);
    expect(remaining).toEqual([]);

    useStore.getState().applyDictation(bookId, transcript, { atIndex: 0 });
    useStore.getState().setDictationDraft(bookId, remaining);

    expect(useStore.getState().dictationDrafts[bookId]).toEqual([]);
    const blocks = useStore.getState().books.find((b) => b.id === bookId)?.manuscript.blocks ?? [];
    expect(blocks[0]?.text).toMatch(/wind howled/i);
    expect(blocks[1]?.text).toMatch(/Before/i);
    expect(blocks.map((b) => b.text).join(' ')).not.toMatch(/scratch this/i);
  });

  it('omits struck spans from the manuscript and clears the box after append', () => {
    const bookId = useStore.getState().createBook('Append draft test', 'fantasy');
    created.push(bookId);

    const draft = [
      { text: 'Hello. ', struck: false },
      { text: 'World.', struck: true },
    ];
    useStore.getState().setDictationDraft(bookId, draft);
    promote(bookId);

    expect(useStore.getState().dictationDrafts[bookId]).toEqual([]);
    const prose = useStore
      .getState()
      .books.find((b) => b.id === bookId)
      ?.manuscript.blocks.filter((b) => b.type === 'paragraph')
      .map((b) => b.text)
      .join(' ');
    expect(prose).toMatch(/Hello/i);
    expect(prose).not.toMatch(/World/i);
  });

  it('does not clear the transcription box when only setting a manuscript caret', () => {
    const bookId = useStore.getState().createBook('Caret only test', 'fantasy');
    created.push(bookId);
    const draft = [{ text: 'staged prose period', struck: false }];
    useStore.getState().setDictationDraft(bookId, draft);
    useStore.getState().setManuscriptPlace(bookId, { scrollTop: 0, blockId: 'blk-1', selectionStart: 4 });
    expect(useStore.getState().dictationDrafts[bookId]).toEqual(draft);
  });
});
