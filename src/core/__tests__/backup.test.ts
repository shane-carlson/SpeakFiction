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
  seriesBookNumber: 1,
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
      originBookId: 'bk-1',
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
    expect(parsed.book.nameLibrary[0]?.originBookId).toBe('bk-1');
  });

  it('round-trips name voice clips on a library entry', () => {
    const withClip = {
      ...book,
      nameLibrary: [
        {
          ...book.nameLibrary[0]!,
          voiceClips: [{ mediaId: 'nvc_1', heard: 'kaldros', source: 'library' as const }],
        },
      ],
    };
    const parsed = parseBackup(backupToJson(serializeBookBackup(withClip, series)));
    expect(parsed.kind).toBe(BACKUP_KIND_BOOK);
    if (parsed.kind !== BACKUP_KIND_BOOK) return;
    expect(parsed.book.nameLibrary[0]?.voiceClips).toEqual([
      { mediaId: 'nvc_1', heard: 'kaldros', source: 'library' },
    ]);
  });

  it('omits originBookId when a name was never tagged', () => {
    const legacy = {
      ...book,
      nameLibrary: [{ id: 'n-1', canonical: 'Kaeldros', category: 'character' as const, aliases: ['kaldros'] }],
    };
    const parsed = parseBackup(backupToJson(serializeBookBackup(legacy, series)));
    expect(parsed.kind).toBe(BACKUP_KIND_BOOK);
    if (parsed.kind !== BACKUP_KIND_BOOK) return;
    expect(parsed.book.nameLibrary[0]?.originBookId).toBeUndefined();
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

  it('round-trips paragraph marks, image blocks, and attached media bytes', () => {
    const withMedia: Book = {
      ...book,
      manuscript: {
        blocks: [
          {
            id: 'p-1',
            type: 'paragraph',
            text: 'The wind howled.',
            marks: [{ kind: 'italic', start: 4, end: 8 }],
          },
          {
            id: 'img-1',
            type: 'image',
            image: { mediaId: 'keep-map', mime: 'image/png', caption: 'The keep', alt: 'Map' },
          },
        ],
      },
    };
    const media = { 'keep-map': { mime: 'image/png', b64: 'AAAA' } };
    const parsed = parseBackup(backupToJson(serializeBookBackup(withMedia, series, media)));
    expect(parsed.kind).toBe(BACKUP_KIND_BOOK);
    if (parsed.kind !== BACKUP_KIND_BOOK) return;
    expect(parsed.book.manuscript.blocks[0].marks).toEqual([{ kind: 'italic', start: 4, end: 8 }]);
    expect(parsed.book.manuscript.blocks[1]).toMatchObject({
      type: 'image',
      image: { mediaId: 'keep-map', mime: 'image/png', caption: 'The keep' },
    });
    expect(parsed.media).toEqual(media);
  });

  it('round-trips a table block', () => {
    const withTable: Book = {
      ...book,
      manuscript: {
        blocks: [
          {
            id: 'tbl-1',
            type: 'table',
            table: {
              rows: [
                [{ text: 'Name' }, { text: 'Role' }],
                [{ text: 'Kaeldros' }, { text: 'Exile' }],
              ],
            },
          },
        ],
      },
    };
    const parsed = parseBackup(backupToJson(serializeBookBackup(withTable, series)));
    expect(parsed.kind).toBe(BACKUP_KIND_BOOK);
    if (parsed.kind !== BACKUP_KIND_BOOK) return;
    expect(parsed.book.manuscript.blocks[0]).toEqual(withTable.manuscript.blocks[0]);
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

  it('round-trips a series book number and drops it for standalones', () => {
    const numbered = { ...book, seriesBookNumber: 2 };
    const parsed = parseBackup(backupToJson(serializeBookBackup(numbered, series)));
    expect(parsed.kind).toBe(BACKUP_KIND_BOOK);
    if (parsed.kind !== BACKUP_KIND_BOOK) return;
    expect(parsed.book.seriesBookNumber).toBe(2);

    const standalone = parseBackup(
      JSON.stringify({
        kind: BACKUP_KIND_BOOK,
        book: { ...book, seriesId: undefined, seriesBookNumber: 9 },
      }),
    );
    expect(standalone.kind).toBe(BACKUP_KIND_BOOK);
    if (standalone.kind !== BACKUP_KIND_BOOK) return;
    expect(standalone.book.seriesId).toBeUndefined();
    expect(standalone.book.seriesBookNumber).toBeUndefined();
  });
});
