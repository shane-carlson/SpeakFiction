import { describe, expect, it } from 'vitest';
import {
  catalogFromBooks,
  companionNameFromPayload,
  createBookNoteId,
  createNameNoteId,
  defaultTakeTitle,
  guessNameCategory,
  isHiddenCompanionNoteId,
  parseCompanionPayload,
  resolveCompanionNameBookId,
} from '../companionLibrary';

describe('companion library catalog', () => {
  it('sorts desktop books and drops untitled rows', () => {
    expect(
      catalogFromBooks(
        [
          { id: 'b2', title: ' Winter ', genreId: 'horror', seriesId: 's1', seriesBookNumber: 2 },
          { id: 'b1', title: 'Ash', genreId: 'fantasy' },
          { id: 'b3', title: '   ', genreId: 'ya' },
        ],
        [{ id: 's1', name: 'The Ember King' }],
      ),
    ).toEqual([
      { id: 'b1', title: 'Ash', genreId: 'fantasy' },
      {
        id: 'b2',
        title: 'Winter',
        genreId: 'horror',
        seriesName: 'The Ember King',
        seriesBookNumber: 2,
      },
    ]);
  });

  it('parses a library payload and a create-book payload', () => {
    expect(
      parseCompanionPayload({
        kind: 'library',
        books: [{ id: 'bk_1', title: 'Ash', genreId: 'fantasy' }],
      }),
    ).toMatchObject({
      kind: 'library',
      books: [{ id: 'bk_1', title: 'Ash', genreId: 'fantasy' }],
    });
    expect(
      parseCompanionPayload({
        kind: 'create-book',
        id: 'bk_new',
        title: 'Glass',
        genreId: 'romantasy',
        seriesName: 'The Cycle',
        seriesBookNumber: 2,
      }),
    ).toMatchObject({
      kind: 'create-book',
      id: 'bk_new',
      title: 'Glass',
      genreId: 'romantasy',
      seriesName: 'The Cycle',
      seriesBookNumber: 2,
    });
    expect(
      parseCompanionPayload({
        kind: 'create-name',
        bookId: 'bk_1',
        canonical: 'Kaeldros',
        aliases: ['kaldros', 'Kaeldros'],
        category: 'character',
      }),
    ).toMatchObject({
      kind: 'create-name',
      bookId: 'bk_1',
      canonical: 'Kaeldros',
      aliases: ['kaldros', 'Kaeldros'],
      category: 'character',
    });
    expect(
      companionNameFromPayload(
        parseCompanionPayload({
          kind: 'create-name',
          bookId: 'bk_1',
          canonical: 'Kaeldros',
          aliases: ['kaldros', 'Kaeldros'],
        }),
      ),
    ).toEqual({
      id: createNameNoteId('bk_1', 'Kaeldros'),
      bookId: 'bk_1',
      canonical: 'Kaeldros',
      aliases: ['kaldros'],
      category: 'character',
    });
  });

  it('treats missing kind as a voice note and keeps book association', () => {
    expect(parseCompanionPayload({ text: 'the wind howled', bookId: 'bk_1', bookHint: 'Ash' })).toEqual({
      kind: 'note',
      text: 'the wind howled',
      title: undefined,
      bookId: 'bk_1',
      bookHint: 'Ash',
      books: [],
      genreId: undefined,
      id: undefined,
      seriesName: undefined,
      seriesBookNumber: undefined,
      canonical: undefined,
      aliases: [],
      category: undefined,
    });
  });

  it('hides catalog and create-book inbox rows from the writer list', () => {
    expect(isHiddenCompanionNoteId('sf_library')).toBe(true);
    expect(isHiddenCompanionNoteId(createBookNoteId('bk_1'))).toBe(true);
    expect(isHiddenCompanionNoteId(createNameNoteId('bk_1', 'Kaeldros'))).toBe(true);
    expect(isHiddenCompanionNoteId('vn_abc')).toBe(false);
  });

  it('guesses a library category from capitalization', () => {
    expect(guessNameCategory('Kaeldros')).toBe('character');
    expect(guessNameCategory('their')).toBe('other');
  });

  it('resolves a companion name onto a desktop book by id, title, or fallback', () => {
    const books = [
      { id: 'bk_1', title: 'Ash' },
      { id: 'bk_2', title: 'Winter' },
    ];
    expect(resolveCompanionNameBookId(books, { bookId: 'bk_2' })).toBe('bk_2');
    expect(resolveCompanionNameBookId(books, { bookId: 'missing', bookHint: 'Ash' })).toBe('bk_1');
    expect(resolveCompanionNameBookId(books, { bookId: 'missing' }, 'bk_2')).toBe('bk_2');
    expect(resolveCompanionNameBookId(books, { bookId: 'missing' })).toBe(null);
  });

  it('names a take from the recording time', () => {
    expect(defaultTakeTitle('not-a-date')).toBe('Voice note');
    expect(defaultTakeTitle('2026-08-22T18:54:00.000Z')).toMatch(/2026/);
  });
});
