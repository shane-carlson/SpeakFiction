import { describe, expect, it } from 'vitest';
import {
  applySeriesAssignment,
  applySeriesBookNumber,
  formatSeriesBookNumber,
  groupLibraryBooks,
  normalizeSeriesBookFields,
  parseSeriesBookNumber,
  seriesMembershipLabel,
} from '../seriesBooks';

describe('parseSeriesBookNumber', () => {
  it('accepts positive integers and 1.5-style decimals', () => {
    expect(parseSeriesBookNumber(1)).toBe(1);
    expect(parseSeriesBookNumber(2)).toBe(2);
    expect(parseSeriesBookNumber(1.5)).toBe(1.5);
    expect(parseSeriesBookNumber('3')).toBe(3);
    expect(parseSeriesBookNumber(' 1.5 ')).toBe(1.5);
  });

  it('rejects empty, zero, and junk', () => {
    expect(parseSeriesBookNumber('')).toBeUndefined();
    expect(parseSeriesBookNumber(0)).toBeUndefined();
    expect(parseSeriesBookNumber(-1)).toBeUndefined();
    expect(parseSeriesBookNumber('nope')).toBeUndefined();
    expect(parseSeriesBookNumber(undefined)).toBeUndefined();
  });
});

describe('series assignment', () => {
  const book = { id: 'bk-1', title: 'Ash', seriesId: 'ser-1', seriesBookNumber: 2 };

  it('keeps the number when the book stays in a series', () => {
    expect(applySeriesAssignment(book, 'ser-2')).toEqual({
      ...book,
      seriesId: 'ser-2',
      seriesBookNumber: 2,
    });
  });

  it('clears the number when the book leaves a series', () => {
    expect(applySeriesAssignment(book, undefined).seriesBookNumber).toBeUndefined();
    expect(applySeriesAssignment(book, '').seriesId).toBeUndefined();
  });

  it('ignores a number unless the book is in a series', () => {
    const standalone = { id: 'bk-2', title: 'Solo', seriesBookNumber: undefined as number | undefined };
    expect(applySeriesBookNumber(standalone, 1).seriesBookNumber).toBeUndefined();
    expect(applySeriesBookNumber(book, '1.5').seriesBookNumber).toBe(1.5);
  });

  it('drops a stray number from persisted standalones', () => {
    expect(
      normalizeSeriesBookFields({ id: 'bk-3', title: 'Solo', seriesBookNumber: 4 }).seriesBookNumber,
    ).toBeUndefined();
  });
});

describe('library labels and grouping', () => {
  it('says Book 2 of the series when numbered', () => {
    expect(formatSeriesBookNumber(2)).toBe('2');
    expect(formatSeriesBookNumber(1.5)).toBe('1.5');
    expect(
      seriesMembershipLabel({ seriesId: 'ser-1', seriesBookNumber: 2 }, 'The Ember King'),
    ).toBe('Book 2 of The Ember King');
    expect(seriesMembershipLabel({ seriesId: 'ser-1' }, 'The Ember King')).toBe('The Ember King');
    expect(seriesMembershipLabel({}, 'The Ember King')).toBeNull();
  });

  it('groups series books by number ahead of standalones', () => {
    const series = [{ id: 'ser-1', name: 'The Ember King' }];
    const books = [
      { id: 'b', title: 'Sequel', seriesId: 'ser-1', seriesBookNumber: 2 },
      { id: 's', title: 'A standalone' },
      { id: 'a', title: 'Prequel', seriesId: 'ser-1', seriesBookNumber: 1 },
    ];
    const groups = groupLibraryBooks(books, series);
    expect(groups.map((g) => g.heading)).toEqual(['The Ember King', 'Standalone']);
    expect(groups[0]!.books.map((b) => b.title)).toEqual(['Prequel', 'Sequel']);
    expect(groups[1]!.books.map((b) => b.id)).toEqual(['s']);
  });
});
