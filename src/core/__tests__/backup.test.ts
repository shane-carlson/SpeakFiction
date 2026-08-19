import { emptyAdaptiveState } from '../adaptiveModel';
import { DEFAULT_AUDIO_SETTINGS } from '../audioSettings';
import {
  BACKUP_KIND_BOOK,
  BACKUP_KIND_LIBRARY,
  backupToJson,
  bookBackupFilename,
  parseBackup,
  serializeBookBackup,
  serializeLibraryBackup,
} from '../backup';
import { DEFAULT_PERSPECTIVE } from '../perspective';
import { DEFAULT_TENSE } from '../tense';
import { DEFAULT_THEME_ID, DEFAULT_THEME_MODE } from '../theme';
import type { Book, Series } from '../types';
import { EMBER_KING_SERIES, EMBER_KING_TITLE } from '../seedManuscript';

const series: Series = { id: 'ser-1', name: EMBER_KING_SERIES };

const book: Book = {
  id: 'bk-1',
  title: EMBER_KING_TITLE,
  seriesId: series.id,
  genreId: 'fantasy',
  tenseId: DEFAULT_TENSE,
  perspectiveId: DEFAULT_PERSPECTIVE,
  nameLibrary: [
    {
      id: 'n-1',
      canonical: 'Kaeldros',
      category: 'character',
      aliases: ['kaldros'],
      note: 'exiled swordmaster',
    },
  ],
  manuscript: {
    blocks: [
      { id: 'ch-1', type: 'chapter', title: 'The Exile Returns' },
      { id: 'p-1', type: 'paragraph', text: 'Kaeldros crossed the ash.' },
    ],
  },
  adaptive: {
    ...emptyAdaptiveState(),
    wordsSeen: 12,
    vocabulary: { kaeldros: 2, crossed: 1 },
    corrections: { kaldros: { Kaeldros: 3 } },
  },
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
};

describe('backup serialize/deserialize', () => {
  it('round-trips a book backup including names, manuscript, and adaptive state', () => {
    const json = backupToJson(serializeBookBackup(book, series));
    const parsed = parseBackup(json);
    expect(parsed.kind).toBe(BACKUP_KIND_BOOK);
    if (parsed.kind !== BACKUP_KIND_BOOK) return;
    expect(parsed.book).toEqual(book);
    expect(parsed.series).toEqual(series);
  });

  it('names the file from the title', () => {
    expect(bookBackupFilename(book)).toBe('Example-The-Ember-King.speakfiction.json');
  });

  it('round-trips a library backup with theme and audio', () => {
    const backup = serializeLibraryBackup({
      series: [series],
      books: [book],
      activeBookId: book.id,
      themeMode: 'light',
      themeId: 'horror',
      audioSettings: { ...DEFAULT_AUDIO_SETTINGS, noiseSuppression: false },
      sttProfileLabel: 'whisper-cli',
    });
    const parsed = parseBackup(backupToJson(backup));
    expect(parsed.kind).toBe(BACKUP_KIND_LIBRARY);
    if (parsed.kind !== BACKUP_KIND_LIBRARY) return;
    expect(parsed.books).toEqual([book]);
    expect(parsed.series).toEqual([series]);
    expect(parsed.themeMode).toBe('light');
    expect(parsed.themeId).toBe('horror');
    expect(parsed.audioSettings.noiseSuppression).toBe(false);
    expect(parsed.sttProfileLabel).toBe('whisper-cli');
  });

  it('fills defaults for missing library settings', () => {
    const parsed = parseBackup(
      JSON.stringify({
        kind: BACKUP_KIND_LIBRARY,
        books: [book],
        series: [series],
      }),
    );
    expect(parsed.kind).toBe(BACKUP_KIND_LIBRARY);
    if (parsed.kind !== BACKUP_KIND_LIBRARY) return;
    expect(parsed.themeMode).toBe(DEFAULT_THEME_MODE);
    expect(parsed.themeId).toBe(DEFAULT_THEME_ID);
    expect(parsed.audioSettings).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseBackup('not-json')).toThrow(/not valid JSON/);
  });

  it('round-trips romance, queer-lit, and ya genre ids and drops unknown ones', () => {
    for (const genreId of ['romance', 'queer-lit', 'ya'] as const) {
      const json = backupToJson(serializeBookBackup({ ...book, genreId }, series));
      const parsed = parseBackup(json);
      expect(parsed.kind).toBe(BACKUP_KIND_BOOK);
      if (parsed.kind !== BACKUP_KIND_BOOK) return;
      expect(parsed.book.genreId).toBe(genreId);
    }
    const parsed = parseBackup(
      JSON.stringify({
        kind: BACKUP_KIND_BOOK,
        book: { ...book, genreId: 'not-a-genre' },
      }),
    );
    expect(parsed.kind).toBe(BACKUP_KIND_BOOK);
    if (parsed.kind !== BACKUP_KIND_BOOK) return;
    expect(parsed.book.genreId).toBe('generic');
  });
});
