import { mergeNameVoiceClips } from './nameVoiceClips';
import type { Book, NameEntry } from './types';

export interface SeriesNameView {
  entry: NameEntry;
  originBookId: string;
  originBookTitle: string;
  fromThisBook: boolean;
}

function nameKey(entry: NameEntry): string | null {
  if (!entry?.canonical) return null;
  return `${entry.category ?? 'other'}:${entry.canonical.toLowerCase()}`;
}

export function booksInSameSeries(books: Book[], book: Book): Book[] {
  if (!book.seriesId) return [book];
  return books.filter((b) => b.seriesId === book.seriesId);
}

export function originBookIdOf(entry: NameEntry, ownerBookId: string): string {
  return entry.originBookId || ownerBookId;
}

/** Unique name-library entries for this book plus the rest of its series. */
export function mergeSeriesNameLibrary(books: Book[], book: Book): NameEntry[] {
  const pool = booksInSameSeries(books, book);
  const byKey = new Map<string, NameEntry>();
  for (const b of pool) {
    for (const entry of b.nameLibrary ?? []) {
      const origin = originBookIdOf(entry, b.id);
      const tagged: NameEntry = { ...entry, originBookId: origin, aliases: entry.aliases ?? [] };
      const key = nameKey(tagged);
      if (!key) continue;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, tagged);
        continue;
      }
      const aliases = [...(prev.aliases ?? [])];
      for (const alias of tagged.aliases ?? []) {
        if (!aliases.some((a) => a.toLowerCase() === alias.toLowerCase())) aliases.push(alias);
      }
      byKey.set(key, {
        ...prev,
        aliases,
        note: prev.note || tagged.note,
        originBookId: prev.originBookId || tagged.originBookId,
        voiceClips: mergeNameVoiceClips(prev.voiceClips, tagged.voiceClips),
      });
    }
  }
  return [...byKey.values()];
}

export function seriesNameViews(books: Book[], book: Book): SeriesNameView[] {
  const pool = booksInSameSeries(books, book);
  const titleById = new Map(pool.map((b) => [b.id, b.title]));
  return mergeSeriesNameLibrary(books, book).map((entry) => {
    const originBookId = originBookIdOf(entry, book.id);
    return {
      entry,
      originBookId,
      originBookTitle: titleById.get(originBookId) ?? book.title,
      fromThisBook: originBookId === book.id,
    };
  });
}

export function bookIdOwningName(books: Book[], entryId: string): string | undefined {
  return books.find((b) => (b.nameLibrary ?? []).some((n) => n.id === entryId))?.id;
}
