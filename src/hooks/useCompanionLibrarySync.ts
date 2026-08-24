import { useEffect } from 'react';
import {
  catalogFromBooks,
  createBookNoteId,
  createNameNoteId,
  guessNameCategory,
  NAME_CATEGORIES,
  resolveCompanionNameBookId,
  type CompanionBook,
  type CompanionName,
} from '../core/companionLibrary';
import { isGenreId } from '../core/theme';
import type { NameCategory } from '../core/types';
import { useStore } from '../store';

function asNameCategory(raw: unknown, canonical: string): NameCategory {
  return (NAME_CATEGORIES as readonly string[]).includes(String(raw))
    ? (raw as NameCategory)
    : guessNameCategory(canonical);
}

type NotesBridge = NonNullable<typeof window.speakfiction>['notes'];

export async function consumePendingCompanionInbox(
  remote: {
    pendingBooks?: CompanionBook[];
    pendingNames?: Array<Partial<CompanionName> & { bookHint?: string }>;
  },
  bridge: Pick<NotesBridge, 'setStatus'> & { publishLibrary?: NotesBridge['publishLibrary'] },
): Promise<void> {
  if (useStore.persist && !useStore.persist.hasHydrated()) return;
  let changed = false;
  const createBook = useStore.getState().createBook;
  const createSeries = useStore.getState().createSeries;
  const setSeriesBookNumber = useStore.getState().setSeriesBookNumber;
  const addNameEntry = useStore.getState().addNameEntry;

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
    changed = true;
  }

  for (const pending of remote.pendingNames ?? []) {
    const canonical = String(pending.canonical || '').trim();
    if (!canonical) continue;
    const state = useStore.getState();
    const bookId = resolveCompanionNameBookId(
      state.books,
      { bookId: pending.bookId, bookHint: pending.bookHint },
      state.activeBookId,
    );
    if (!bookId) continue;
    try {
      addNameEntry(bookId, {
        canonical,
        category: asNameCategory(pending.category, canonical),
        aliases: (pending.aliases ?? [])
          .map((alias) => alias.trim())
          .filter((alias) => alias && alias.toLowerCase() !== canonical.toLowerCase()),
        originBookId: bookId,
      });
      await bridge.setStatus(pending.id || createNameNoteId(bookId, canonical), 'imported');
      changed = true;
    } catch {
      /* leave the note in the inbox and try again on the next refresh */
    }
  }

  if (changed) {
    const state = useStore.getState();
    await bridge.publishLibrary?.(catalogFromBooks(state.books, state.series));
  }
}

export function useCompanionLibrarySync() {
  const catalogKey = useStore((s) =>
    [
      s.books
        .map((book) => `${book.id}:${book.title}:${book.genreId}:${book.seriesId ?? ''}:${book.seriesBookNumber ?? ''}`)
        .join('|'),
      s.series.map((item) => `${item.id}:${item.name}`).join('|'),
    ].join('#'),
  );

  useEffect(() => {
    const bridge = window.speakfiction?.notes;
    if (!bridge?.publishLibrary) return;
    const state = useStore.getState();
    void bridge.publishLibrary(catalogFromBooks(state.books, state.series));
  }, [catalogKey]);
}

export type { CompanionBook };
