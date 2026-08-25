import type { GenreId, NameCategory } from './types';
import { parseSeriesBookNumber } from './seriesBooks';
import { isGenreId } from './theme';

export const LIBRARY_NOTE_ID = 'sf_library';
export const CREATE_BOOK_PREFIX = 'sf_book_';
export const CREATE_NAME_PREFIX = 'sf_name_';
export const NAME_CATEGORIES = ['character', 'location', 'item', 'organization', 'other'] as const;

export type CompanionBook = {
  id: string;
  title: string;
  genreId: GenreId;
  seriesName?: string;
  seriesBookNumber?: number;
};

export type CompanionName = {
  id: string;
  bookId: string;
  canonical: string;
  aliases: string[];
  category: NameCategory;
  bookHint?: string;
};

export type CompanionPayload = {
  kind: 'note' | 'library' | 'create-book' | 'create-name';
  text: string;
  title?: string;
  bookId?: string;
  bookHint?: string;
  books: CompanionBook[];
  genreId?: GenreId;
  id?: string;
  seriesName?: string;
  seriesBookNumber?: number;
  canonical?: string;
  aliases: string[];
  category?: NameCategory;
  recordOnly?: boolean;
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

export function slugNameId(canonical: string): string {
  return canonical
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function createNameNoteId(bookId: string, canonical: string): string {
  return `${CREATE_NAME_PREFIX}${bookId}_${slugNameId(canonical) || 'name'}`;
}

export function guessNameCategory(canonical: string): NameCategory {
  const trimmed = canonical.trim();
  if (!trimmed) return 'other';
  return /^[A-Z]/.test(trimmed) || /\s/.test(trimmed) ? 'character' : 'other';
}

export function isLibraryNoteId(id: unknown): boolean {
  return id === LIBRARY_NOTE_ID;
}

export function isCreateBookNoteId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith(CREATE_BOOK_PREFIX);
}

export function isCreateNameNoteId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith(CREATE_NAME_PREFIX);
}

export function isHiddenCompanionNoteId(id: unknown): boolean {
  return isLibraryNoteId(id) || isCreateBookNoteId(id) || isCreateNameNoteId(id);
}

function parseNameCategory(raw: unknown): NameCategory | undefined {
  return (NAME_CATEGORIES as readonly string[]).includes(String(raw)) ? (raw as NameCategory) : undefined;
}

function parseAliases(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const aliases: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const next = typeof item === 'string' ? item.trim() : '';
    if (!next) continue;
    const key = next.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    aliases.push(next);
  }
  return aliases;
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
  const kind =
    rec.kind === 'library' || rec.kind === 'create-book' || rec.kind === 'create-name' ? rec.kind : 'note';
  const text = typeof rec.text === 'string' ? rec.text : '';
  const title = typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : undefined;
  const bookId = typeof rec.bookId === 'string' && rec.bookId.trim() ? rec.bookId.trim() : undefined;
  const bookHint = typeof rec.bookHint === 'string' && rec.bookHint.trim() ? rec.bookHint.trim() : undefined;
  const id = typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : undefined;
  const genreId = isGenreId(typeof rec.genreId === 'string' ? rec.genreId : '') ? rec.genreId : undefined;
  const seriesName = typeof rec.seriesName === 'string' && rec.seriesName.trim() ? rec.seriesName.trim() : undefined;
  const seriesBookNumber = seriesName ? parseSeriesBookNumber(rec.seriesBookNumber) : undefined;
  const canonical = typeof rec.canonical === 'string' && rec.canonical.trim() ? rec.canonical.trim() : undefined;
  const category = parseNameCategory(rec.category);
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
    canonical,
    aliases: parseAliases(rec.aliases),
    category,
    ...(rec.recordOnly === true ? { recordOnly: true } : {}),
  };
}

export function companionNameFromPayload(payload: CompanionPayload, fallbackId?: string): CompanionName | null {
  const canonical = payload.canonical?.trim() || payload.title?.trim() || '';
  const bookId = payload.bookId?.trim() || '';
  if (!canonical || !bookId) return null;
  const aliases = payload.aliases.filter((alias) => alias.toLowerCase() !== canonical.toLowerCase());
  return {
    id: payload.id?.trim() || fallbackId || createNameNoteId(bookId, canonical),
    bookId,
    canonical,
    aliases,
    category: payload.category ?? guessNameCategory(canonical),
    ...(payload.bookHint ? { bookHint: payload.bookHint } : {}),
  };
}

export function resolveCompanionNameBookId(
  books: Array<{ id: string; title: string }>,
  pending: { bookId?: string; bookHint?: string },
  fallbackId?: string | null,
): string | null {
  const id = pending.bookId?.trim();
  if (id && books.some((book) => book.id === id)) return id;
  const hint = pending.bookHint?.trim().toLowerCase();
  if (hint) {
    const byTitle = books.find((book) => book.title.trim().toLowerCase() === hint);
    if (byTitle) return byTitle.id;
  }
  const fallback = fallbackId?.trim();
  if (fallback && books.some((book) => book.id === fallback)) return fallback;
  return null;
}
