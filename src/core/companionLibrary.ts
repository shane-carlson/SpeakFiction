import type { GenreId } from './types';
import { parseSeriesBookNumber } from './seriesBooks';
import { isGenreId } from './theme';

export const LIBRARY_NOTE_ID = 'sf_library';
export const CREATE_BOOK_PREFIX = 'sf_book_';

export type CompanionBook = {
  id: string;
  title: string;
  genreId: GenreId;
  seriesName?: string;
  seriesBookNumber?: number;
};

export type CompanionPayload = {
  kind: 'note' | 'library' | 'create-book';
  text: string;
  title?: string;
  bookId?: string;
  bookHint?: string;
  books: CompanionBook[];
  genreId?: GenreId;
  id?: string;
  seriesName?: string;
  seriesBookNumber?: number;
};

export function catalogFromBooks(
  books: Array<{
    id: string;
    title: string;
    genreId: GenreId;
    seriesId?: string;
    seriesBookNumber?: number;
  }>,
  series: Array<{ id: string; name: string }> = [],
): CompanionBook[] {
  const seriesName = new Map(series.map((item) => [item.id, item.name.trim()]));
  return books
    .map((book) => {
      const name = book.seriesId ? seriesName.get(book.seriesId) : undefined;
      const number = name ? parseSeriesBookNumber(book.seriesBookNumber) : undefined;
      return {
        id: book.id,
        title: book.title.trim(),
        genreId: book.genreId,
        ...(name ? { seriesName: name } : {}),
        ...(number != null ? { seriesBookNumber: number } : {}),
      };
    })
    .filter((book) => book.id && book.title)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function createBookNoteId(bookId: string): string {
  return `${CREATE_BOOK_PREFIX}${bookId}`;
}

export function isLibraryNoteId(id: unknown): boolean {
  return id === LIBRARY_NOTE_ID;
}

export function isCreateBookNoteId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith(CREATE_BOOK_PREFIX);
}

export function isHiddenCompanionNoteId(id: unknown): boolean {
  return isLibraryNoteId(id) || isCreateBookNoteId(id);
}

export function defaultTakeTitle(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'Voice note';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function parseCompanionBooks(raw: unknown): CompanionBook[] {
  if (!Array.isArray(raw)) return [];
  const books: CompanionBook[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    const title = typeof rec.title === 'string' ? rec.title.trim() : '';
    if (!id || !title) continue;
    const seriesName = typeof rec.seriesName === 'string' && rec.seriesName.trim() ? rec.seriesName.trim() : undefined;
    const seriesBookNumber = seriesName ? parseSeriesBookNumber(rec.seriesBookNumber) : undefined;
    books.push({
      id,
      title,
      genreId: isGenreId(typeof rec.genreId === 'string' ? rec.genreId : '') ? rec.genreId : 'generic',
      ...(seriesName ? { seriesName } : {}),
      ...(seriesBookNumber != null ? { seriesBookNumber } : {}),
    });
  }
  return books;
}

export function parseCompanionPayload(raw: unknown): CompanionPayload {
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const kind = rec.kind === 'library' || rec.kind === 'create-book' ? rec.kind : 'note';
  const text = typeof rec.text === 'string' ? rec.text : '';
  const title = typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : undefined;
  const bookId = typeof rec.bookId === 'string' && rec.bookId.trim() ? rec.bookId.trim() : undefined;
  const bookHint = typeof rec.bookHint === 'string' && rec.bookHint.trim() ? rec.bookHint.trim() : undefined;
  const id = typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : undefined;
  const genreId = isGenreId(typeof rec.genreId === 'string' ? rec.genreId : '') ? rec.genreId : undefined;
  const seriesName = typeof rec.seriesName === 'string' && rec.seriesName.trim() ? rec.seriesName.trim() : undefined;
  const seriesBookNumber = seriesName ? parseSeriesBookNumber(rec.seriesBookNumber) : undefined;
  return {
    kind,
    text,
    title,
    bookId,
    bookHint,
    books: parseCompanionBooks(rec.books),
    genreId,
    id,
    seriesName,
    seriesBookNumber,
  };
}
