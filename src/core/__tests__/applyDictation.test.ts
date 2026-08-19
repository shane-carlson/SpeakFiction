import { afterEach, describe, expect, it } from 'vitest';
import { takeInsertTranscript } from '../dictationDraft';
import { useStore } from '../../store';

describe('applyDictation', () => {
  const created: string[] = [];

  afterEach(() => {
    while (created.length) {
      const id = created.pop();
      if (id) useStore.getState().deleteBook(id);
    }
  });

  it('inserts at the chosen index and leaves every dictation span in the box', () => {
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
    expect(remaining).toEqual(draft);

    useStore.getState().applyDictation(bookId, transcript, { atIndex: 0 });

    expect(useStore.getState().dictationDrafts[bookId]).toEqual(draft);
    const blocks = useStore.getState().books.find((b) => b.id === bookId)?.manuscript.blocks ?? [];
    expect(blocks[0]?.text).toMatch(/wind howled/i);
    expect(blocks[1]?.text).toMatch(/Before/i);
  });

  it('appends without wiping a mixed struck draft', () => {
    const bookId = useStore.getState().createBook('Append draft test', 'fantasy');
    created.push(bookId);

    const draft = [
      { text: 'Hello. ', struck: false },
      { text: 'World.', struck: true },
    ];
    useStore.getState().setDictationDraft(bookId, draft);
    const { transcript } = takeInsertTranscript(draft);
    useStore.getState().applyDictation(bookId, transcript);

    expect(useStore.getState().dictationDrafts[bookId]).toEqual(draft);
    const prose = useStore
      .getState()
      .books.find((b) => b.id === bookId)
      ?.manuscript.blocks.filter((b) => b.type === 'paragraph')
      .map((b) => b.text)
      .join(' ');
    expect(prose).toMatch(/Hello/i);
    expect(prose).not.toMatch(/World/i);
  });
});
