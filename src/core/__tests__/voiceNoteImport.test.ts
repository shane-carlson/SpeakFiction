import { afterEach, describe, expect, it } from 'vitest';
import { draftText } from '../dictationDraft';
import { importTextToTranscriptionBox } from '../voiceNoteImport';
import { useStore } from '../../store';

describe('importTextToTranscriptionBox', () => {
  const created: string[] = [];

  afterEach(() => {
    while (created.length) {
      const id = created.pop();
      if (id) useStore.getState().deleteBook(id);
    }
  });

  it('runs names and structure cues into the transcription box, not the manuscript', () => {
    const bookId = useStore.getState().createBook('Inbox import', 'fantasy');
    created.push(bookId);
    const book = useStore.getState().books.find((b) => b.id === bookId)!;
    const result = importTextToTranscriptionBox(
      'new chapter titled The Gate period the wind howled',
      [],
      { book, books: useStore.getState().books },
    );
    expect(result.cleaned.toLowerCase()).toMatch(/the gate/);
    expect(result.cleaned.toLowerCase()).toMatch(/wind howled/);
    expect(result.captureCommand).toBe(true);
    expect(book.manuscript.blocks).toEqual([]);
  });

  it('store import lands in the box and leaves the manuscript empty', () => {
    const bookId = useStore.getState().createBook('Box only', 'fantasy');
    created.push(bookId);
    const landed = useStore.getState().importToTranscriptionBox(
      bookId,
      'new paragraph the river turned black period',
    );
    expect(landed.added).toBe(true);
    expect(draftText(useStore.getState().dictationDrafts[bookId] ?? [])).toMatch(/river turned black/i);
    expect(useStore.getState().books.find((b) => b.id === bookId)?.manuscript.blocks ?? []).toEqual([]);
  });
});
