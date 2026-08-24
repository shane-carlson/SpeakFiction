import { describe, expect, it } from 'vitest';
import { emptyAdaptiveState } from '../adaptiveModel';
import {
  bookIdOwningName,
  booksInSameSeries,
  mergeSeriesNameLibrary,
  originBookIdOf,
  seriesNameViews,
} from '../seriesNames';
import type { Book, NameEntry } from '../types';

function book(partial: Partial<Book> & Pick<Book, 'id' | 'title'>): Book {
  return {
    genreId: 'fantasy',
    tenseId: 'past',
    perspectiveId: 'third-limited',
    nameLibrary: [],
    manuscript: { blocks: [] },
    adaptive: emptyAdaptiveState(),
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

const andreos: NameEntry = {
  id: 'n-1',
  canonical: 'Andreos',
  category: 'character',
  aliases: ['andreus'],
  originBookId: 'bk-1',
};

const mara: NameEntry = {
  id: 'n-2',
  canonical: 'Mara Vale',
  category: 'character',
  aliases: [],
  originBookId: 'bk-2',
};

const keep: NameEntry = {
  id: 'n-3',
  canonical: 'Vaelthorn Keep',
  category: 'location',
  aliases: ['valthorn keep'],
  originBookId: 'bk-1',
};

describe('series name library', () => {
  const book1 = book({
    id: 'bk-1',
    title: 'Ash Rising',
    seriesId: 'ser-1',
    nameLibrary: [andreos, keep],
  });
  const book2 = book({
    id: 'bk-2',
    title: 'Winter of Glass',
    seriesId: 'ser-1',
    nameLibrary: [mara],
  });
  const standalone = book({
    id: 'bk-3',
    title: 'A standalone',
    nameLibrary: [{ id: 'n-9', canonical: 'Solo', category: 'character', aliases: [] }],
  });
  const books = [book1, book2, standalone];

  it('merges names across books in the same series', () => {
    const merged = mergeSeriesNameLibrary(books, book2);
    expect(merged.map((n) => n.canonical).sort()).toEqual(['Andreos', 'Mara Vale', 'Vaelthorn Keep']);
    expect(booksInSameSeries(books, book2).map((b) => b.id)).toEqual(['bk-1', 'bk-2']);
  });

  it('does not pull names from a standalone or another series', () => {
    const merged = mergeSeriesNameLibrary(books, standalone);
    expect(merged.map((n) => n.canonical)).toEqual(['Solo']);
  });

  it('keeps the origin book id and title on each view', () => {
    const views = seriesNameViews(books, book2);
    const andreosView = views.find((v) => v.entry.canonical === 'Andreos');
    expect(andreosView).toMatchObject({
      originBookId: 'bk-1',
      originBookTitle: 'Ash Rising',
      fromThisBook: false,
    });
    const maraView = views.find((v) => v.entry.canonical === 'Mara Vale');
    expect(maraView).toMatchObject({
      originBookId: 'bk-2',
      originBookTitle: 'Winter of Glass',
      fromThisBook: true,
    });
  });

  it('does not throw when a book is missing nameLibrary', () => {
    const broken = book({ id: 'bk-x', title: 'Broken' });
    delete (broken as { nameLibrary?: NameEntry[] }).nameLibrary;
    expect(mergeSeriesNameLibrary([broken], broken)).toEqual([]);
    expect(seriesNameViews([broken], broken)).toEqual([]);
  });

  it('finds the book that owns a name entry', () => {
    expect(bookIdOwningName(books, 'n-1')).toBe('bk-1');
    expect(bookIdOwningName(books, 'n-2')).toBe('bk-2');
    expect(bookIdOwningName(books, 'missing')).toBeUndefined();
  });

  it('falls back to the holding book when originBookId is missing', () => {
    const legacy: NameEntry = { id: 'n-4', canonical: 'Kael', category: 'character', aliases: [] };
    expect(originBookIdOf(legacy, 'bk-2')).toBe('bk-2');
  });

  it('dedupes by category and canonical, merging aliases', () => {
    const dup: NameEntry = {
      id: 'n-1b',
      canonical: 'andreos',
      category: 'character',
      aliases: ['andrayos'],
      originBookId: 'bk-2',
    };
    const withDup = [book1, book({ ...book2, nameLibrary: [mara, dup] }), standalone];
    const merged = mergeSeriesNameLibrary(withDup, book2);
    const one = merged.filter((n) => n.canonical.toLowerCase() === 'andreos');
    expect(one).toHaveLength(1);
    expect(one[0]!.aliases.map((a) => a.toLowerCase()).sort()).toEqual(['andrayos', 'andreus']);
    expect(one[0]!.originBookId).toBe('bk-1');
  });

  it('merges voice clips when the same name appears on two books', () => {
    const withClips: NameEntry = {
      ...andreos,
      id: 'n-1b',
      voiceClips: [{ mediaId: 'nvc_b', heard: 'andrayos', source: 'library' }],
    };
    const originClips: NameEntry = {
      ...andreos,
      voiceClips: [{ mediaId: 'nvc_a', source: 'dictation' }],
    };
    const withDup = [
      book({ ...book1, nameLibrary: [originClips, keep] }),
      book({ ...book2, nameLibrary: [mara, withClips] }),
      standalone,
    ];
    const merged = mergeSeriesNameLibrary(withDup, book2);
    const one = merged.find((n) => n.canonical.toLowerCase() === 'andreos');
    expect(one?.voiceClips?.map((c) => c.mediaId).sort()).toEqual(['nvc_a', 'nvc_b']);
  });
});
