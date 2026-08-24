import { useEffect, useRef } from 'react';
import { catalogFromBooks, createBookNoteId, type CompanionBook } from '../core/companionLibrary';
import { isGenreId } from '../core/theme';
import { useStore } from '../store';

export function useCompanionLibrarySync() {
  const createBook = useStore((s) => s.createBook);
  const createSeries = useStore((s) => s.createSeries);
  const setSeriesBookNumber = useStore((s) => s.setSeriesBookNumber);
  const catalogKey = useStore((s) =>
    [
      s.books
        .map((book) => `${book.id}:${book.title}:${book.genreId}:${book.seriesId ?? ''}:${book.seriesBookNumber ?? ''}`)
        .join('|'),
      s.series.map((item) => `${item.id}:${item.name}`).join('|'),
    ].join('#'),
  );
  const pulled = useRef(false);

  useEffect(() => {
    const bridge = window.speakfiction?.notes;
    if (!bridge?.publishLibrary) return;
    const state = useStore.getState();
    const catalog = catalogFromBooks(state.books, state.series);
    void bridge.publishLibrary(catalog);
  }, [catalogKey]);

  useEffect(() => {
    if (pulled.current) return;
    const bridge = window.speakfiction?.notes;
    if (!bridge?.refresh) return;
    pulled.current = true;
    void (async () => {
      const remote = await bridge.refresh();
      for (const pending of remote.pendingBooks ?? []) {
        const genreId = isGenreId(pending.genreId) ? pending.genreId : 'generic';
        const seriesName = pending.seriesName?.trim();
        const existing = seriesName
          ? useStore.getState().series.find((item) => item.name.toLowerCase() === seriesName.toLowerCase())
          : undefined;
        const seriesId = seriesName ? existing?.id ?? createSeries(seriesName) : undefined;
        const id = createBook(pending.title, genreId, seriesId, pending.id);
        if (seriesId) setSeriesBookNumber(id, pending.seriesBookNumber);
        await bridge.setStatus(createBookNoteId(pending.id), 'imported');
      }
      const state = useStore.getState();
      const catalog = catalogFromBooks(state.books, state.series);
      await bridge.publishLibrary?.(catalog);
    })();
  }, [createBook, createSeries, setSeriesBookNumber]);
}

export type { CompanionBook };
