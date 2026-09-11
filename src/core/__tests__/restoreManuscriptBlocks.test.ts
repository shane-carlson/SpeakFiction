import { afterEach, describe, expect, it } from 'vitest';
import { useStore } from '../../store';

describe('restoreManuscriptBlocks', () => {
  const created: string[] = [];

  afterEach(() => {
    while (created.length) {
      const id = created.pop();
      if (id) useStore.getState().deleteBook(id);
    }
  });

  it('replaces the live manuscript and lets undo bring the current pages back', () => {
    const bookId = useStore.getState().createBook('Version restore', 'fantasy');
    created.push(bookId);
    useStore.getState().applyDictation(bookId, 'The wind howled period');
    const previous = useStore.getState().books.find((b) => b.id === bookId)?.manuscript.blocks ?? [];
    expect(previous[0]?.text).toMatch(/wind howled/i);

    useStore.getState().restoreManuscriptBlocks(bookId, [
      { id: 'old', type: 'paragraph', text: 'Earlier draft.' },
    ]);
    expect(useStore.getState().books.find((b) => b.id === bookId)?.manuscript.blocks[0]?.text).toBe(
      'Earlier draft.',
    );

    useStore.getState().undoManuscript(bookId);
    expect(useStore.getState().books.find((b) => b.id === bookId)?.manuscript.blocks).toEqual(previous);
  });
});
