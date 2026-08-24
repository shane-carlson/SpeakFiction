import type { ThemeId } from './theme';

async function asyncStore() {
  try {
    return (await import('@react-native-async-storage/async-storage')).default;
  } catch {
    return null;
  }
}
import { THEME_LIST, isThemeId } from './theme';

const BOOKS_STORE = 'sf-companion-books';
export const LIBRARY_NOTE_ID = 'sf_library';
export const CREATE_BOOK_PREFIX = 'sf_book_';
export const CREATE_NAME_PREFIX = 'sf_name_';
export const NAME_CATEGORIES = ['character', 'location', 'item', 'organization', 'other'] as const;
export type CompanionNameCategory = (typeof NAME_CATEGORIES)[number];

export type CompanionGenreId = Exclude<ThemeId, never>;

export type CompanionBook = {
  id: string;
  title: string;
  genreId: CompanionGenreId;
  seriesName?: string;
  seriesBookNumber?: number;
};

function parseBookNumber(raw: unknown): number | undefined {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

export function knownSeriesNames(books: CompanionBook[]): string[] {
  const names = new Set<string>();
  for (const book of books) {
    const name = book.seriesName?.trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function bookSeriesLine(book: Pick<CompanionBook, 'seriesName' | 'seriesBookNumber'>): string | null {
  const name = book.seriesName?.trim();
  if (!name) return null;
  const n = parseBookNumber(book.seriesBookNumber);
  return n != null ? `Book ${n} of ${name}` : name;
}

export const BOOK_GENRES = THEME_LIST.map((item) => ({ id: item.id, name: item.name }));

export function createBookId(): string {
  return `bk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

export function guessNameCategory(canonical: string): CompanionNameCategory {
  const trimmed = canonical.trim();
  if (!trimmed) return 'other';
  return /^[A-Z]/.test(trimmed) || /\s/.test(trimmed) ? 'character' : 'other';
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
    const seriesBookNumber = seriesName ? parseBookNumber(rec.seriesBookNumber) : undefined;
    books.push({
      id,
      title,
      genreId: isThemeId(typeof rec.genreId === 'string' ? rec.genreId : '') ? rec.genreId : 'generic',
      ...(seriesName ? { seriesName } : {}),
      ...(seriesBookNumber != null ? { seriesBookNumber } : {}),
    });
  }
  return books.sort((a, b) => a.title.localeCompare(b.title));
}

export function mergeBooks(current: CompanionBook[], incoming: CompanionBook[]): CompanionBook[] {
  const byId = new Map(current.map((book) => [book.id, book]));
  for (const book of incoming) byId.set(book.id, book);
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export async function loadCachedBooks(): Promise<CompanionBook[]> {
  try {
    const raw = await (await asyncStore())?.getItem(BOOKS_STORE);
    return parseCompanionBooks(JSON.parse(raw || '[]'));
  } catch {
    return [];
  }
}

export async function saveCachedBooks(books: CompanionBook[]): Promise<void> {
  try {
    await (await asyncStore())?.setItem(BOOKS_STORE, JSON.stringify(books));
  } catch {
    /* catalog still lives in memory */
  }
}

export function bookLabel(books: CompanionBook[], bookId: string | null, fallbackTitle?: string | null): string {
  if (!bookId) return 'None';
  return books.find((book) => book.id === bookId)?.title || fallbackTitle?.trim() || 'None';
}
