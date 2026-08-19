/**
 * Book-in-series numbering. The number lives on the book and only applies
 * while that book belongs to a series.
 */

export interface SeriesRef {
  id: string;
  name: string;
}

export interface SeriesBookFields {
  seriesId?: string;
  seriesBookNumber?: number;
  title: string;
}

export interface LibraryBookGroup<T> {
  id: string;
  heading: string | null;
  books: T[];
}

/** Positive integers or simple decimals such as 1.5. */
export function parseSeriesBookNumber(raw: unknown): number | undefined {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return undefined;
    return raw;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return n;
  }
  return undefined;
}

export function formatSeriesBookNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const text = String(n);
  return text.replace(/\.0+$/, '') || text;
}

/** Keep a number when moving between series; drop it when leaving a series. */
export function applySeriesAssignment<T extends SeriesBookFields>(book: T, seriesId?: string): T {
  const nextId = seriesId || undefined;
  if (!nextId) {
    return { ...book, seriesId: undefined, seriesBookNumber: undefined };
  }
  return { ...book, seriesId: nextId };
}

export function applySeriesBookNumber<T extends SeriesBookFields>(book: T, raw: unknown): T {
  if (!book.seriesId) return { ...book, seriesBookNumber: undefined };
  return { ...book, seriesBookNumber: parseSeriesBookNumber(raw) };
}

export function normalizeSeriesBookFields<T extends SeriesBookFields>(book: T): T {
  if (!book.seriesId) {
    if (book.seriesBookNumber == null) return book;
    return { ...book, seriesBookNumber: undefined };
  }
  const n = parseSeriesBookNumber(book.seriesBookNumber);
  if (n === book.seriesBookNumber) return book;
  return { ...book, seriesBookNumber: n };
}

export function seriesMembershipLabel(
  book: Pick<SeriesBookFields, 'seriesId' | 'seriesBookNumber'>,
  seriesName?: string,
): string | null {
  if (!book.seriesId || !seriesName) return null;
  const n = parseSeriesBookNumber(book.seriesBookNumber);
  if (n == null) return seriesName;
  return `Book ${formatSeriesBookNumber(n)} of ${seriesName}`;
}

export function groupLibraryBooks<T extends SeriesBookFields & { id: string }>(
  books: T[],
  series: SeriesRef[],
): Array<LibraryBookGroup<T>> {
  const bySeries = new Map<string, T[]>();
  const standalone: T[] = [];
  for (const book of books) {
    if (book.seriesId) {
      const list = bySeries.get(book.seriesId) ?? [];
      list.push(book);
      bySeries.set(book.seriesId, list);
    } else {
      standalone.push(book);
    }
  }

  const byNumber = (a: T, b: T) => {
    const an = parseSeriesBookNumber(a.seriesBookNumber);
    const bn = parseSeriesBookNumber(b.seriesBookNumber);
    if (an != null && bn != null && an !== bn) return an - bn;
    if (an != null && bn == null) return -1;
    if (an == null && bn != null) return 1;
    return a.title.localeCompare(b.title);
  };

  const groups: Array<LibraryBookGroup<T>> = [];
  const named = series.filter((s) => bySeries.has(s.id)).sort((a, b) => a.name.localeCompare(b.name));
  const seen = new Set<string>();
  for (const s of named) {
    seen.add(s.id);
    groups.push({
      id: s.id,
      heading: s.name,
      books: (bySeries.get(s.id) ?? []).slice().sort(byNumber),
    });
  }
  for (const [id, list] of bySeries) {
    if (seen.has(id)) continue;
    groups.push({ id, heading: 'Series', books: list.slice().sort(byNumber) });
  }
  if (standalone.length) {
    groups.push({
      id: '__standalone__',
      heading: groups.length ? 'Standalone' : null,
      books: standalone,
    });
  }
  return groups;
}
