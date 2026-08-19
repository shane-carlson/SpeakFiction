import type { AdaptiveModelState, Book, Manuscript, NameEntry, Series } from './types';
import { emptyAdaptiveState } from './adaptiveModel';
import { DEFAULT_TENSE } from './tense';
import { DEFAULT_PERSPECTIVE } from './perspective';
import { DEFAULT_THEME_ID, DEFAULT_THEME_MODE, isGenreId, isThemeId, type ThemeId, type ThemeMode } from './theme';
import { DEFAULT_AUDIO_SETTINGS, type AudioSettings } from './audioSettings';

export const BACKUP_KIND_BOOK = 'speakfiction.book' as const;
export const BACKUP_KIND_LIBRARY = 'speakfiction.library' as const;
export const BACKUP_FORMAT_VERSION = 1;

export interface BookBackup {
  kind: typeof BACKUP_KIND_BOOK;
  version: number;
  exportedAt: number;
  book: Book;
  series?: Series | null;
}

export interface LibraryBackup {
  kind: typeof BACKUP_KIND_LIBRARY;
  version: number;
  exportedAt: number;
  series: Series[];
  books: Book[];
  activeBookId: string | null;
  themeMode: ThemeMode;
  themeId: ThemeId;
  audioSettings: AudioSettings;
  sttProfileLabel?: string | null;
}

export type SpeakFictionBackup = BookBackup | LibraryBackup;

export function fileSlug(title: string): string {
  return title.trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
}

export function bookBackupFilename(book: Book): string {
  return `${fileSlug(book.title)}.speakfiction.json`;
}

export function libraryBackupFilename(): string {
  return 'speakfiction-library.json';
}

export function serializeBookBackup(book: Book, series?: Series | null): BookBackup {
  return {
    kind: BACKUP_KIND_BOOK,
    version: BACKUP_FORMAT_VERSION,
    exportedAt: Date.now(),
    book,
    series: series ?? null,
  };
}

export function serializeLibraryBackup(input: {
  series: Series[];
  books: Book[];
  activeBookId: string | null;
  themeMode: ThemeMode;
  themeId: ThemeId;
  audioSettings: AudioSettings;
  sttProfileLabel?: string | null;
}): LibraryBackup {
  return {
    kind: BACKUP_KIND_LIBRARY,
    version: BACKUP_FORMAT_VERSION,
    exportedAt: Date.now(),
    series: input.series,
    books: input.books,
    activeBookId: input.activeBookId,
    themeMode: input.themeMode,
    themeId: input.themeId,
    audioSettings: input.audioSettings,
    sttProfileLabel: input.sttProfileLabel ?? null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeAdaptive(raw: unknown): AdaptiveModelState {
  const rec = asRecord(raw);
  if (!rec) return emptyAdaptiveState();
  return {
    corrections: rec.corrections && typeof rec.corrections === 'object' ? (rec.corrections as AdaptiveModelState['corrections']) : {},
    vocabulary: rec.vocabulary && typeof rec.vocabulary === 'object' ? (rec.vocabulary as AdaptiveModelState['vocabulary']) : {},
    wordsSeen: typeof rec.wordsSeen === 'number' ? rec.wordsSeen : 0,
  };
}

function normalizeManuscript(raw: unknown): Manuscript {
  const rec = asRecord(raw);
  const blocks = rec && Array.isArray(rec.blocks) ? rec.blocks : [];
  return {
    blocks: blocks
      .map((b) => asRecord(b))
      .filter((b): b is Record<string, unknown> => Boolean(b && typeof b.id === 'string' && typeof b.type === 'string'))
      .map((b) => ({
        id: String(b.id),
        type: b.type as Manuscript['blocks'][number]['type'],
        title: typeof b.title === 'string' ? b.title : undefined,
        text: typeof b.text === 'string' ? b.text : undefined,
      })),
  };
}

function normalizeNameLibrary(raw: unknown): NameEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((n) => asRecord(n))
    .filter((n): n is Record<string, unknown> => Boolean(n && typeof n.id === 'string' && typeof n.canonical === 'string'))
    .map((n) => ({
      id: String(n.id),
      canonical: String(n.canonical),
      category: (typeof n.category === 'string' ? n.category : 'other') as NameEntry['category'],
      aliases: Array.isArray(n.aliases) ? n.aliases.map(String) : [],
      note: typeof n.note === 'string' ? n.note : undefined,
    }));
}

export function normalizeBook(raw: unknown): Book | null {
  const rec = asRecord(raw);
  if (!rec || typeof rec.id !== 'string' || typeof rec.title !== 'string') return null;
  const genreId = typeof rec.genreId === 'string' ? rec.genreId : '';
  return {
    id: rec.id,
    title: rec.title,
    seriesId: typeof rec.seriesId === 'string' ? rec.seriesId : undefined,
    genreId: isGenreId(genreId) ? genreId : 'generic',
    tenseId: (typeof rec.tenseId === 'string' ? rec.tenseId : DEFAULT_TENSE) as Book['tenseId'],
    perspectiveId: (typeof rec.perspectiveId === 'string' ? rec.perspectiveId : DEFAULT_PERSPECTIVE) as Book['perspectiveId'],
    nameLibrary: normalizeNameLibrary(rec.nameLibrary),
    manuscript: normalizeManuscript(rec.manuscript),
    adaptive: normalizeAdaptive(rec.adaptive),
    createdAt: typeof rec.createdAt === 'number' ? rec.createdAt : Date.now(),
    updatedAt: typeof rec.updatedAt === 'number' ? rec.updatedAt : Date.now(),
  };
}

function normalizeSeries(raw: unknown): Series | null {
  const rec = asRecord(raw);
  if (!rec || typeof rec.id !== 'string' || typeof rec.name !== 'string') return null;
  return { id: rec.id, name: rec.name };
}

function normalizeAudio(raw: unknown): AudioSettings {
  const rec = asRecord(raw);
  return {
    inputDeviceId: typeof rec?.inputDeviceId === 'string' ? rec.inputDeviceId : DEFAULT_AUDIO_SETTINGS.inputDeviceId,
    echoCancellation: typeof rec?.echoCancellation === 'boolean' ? rec.echoCancellation : DEFAULT_AUDIO_SETTINGS.echoCancellation,
    noiseSuppression: typeof rec?.noiseSuppression === 'boolean' ? rec.noiseSuppression : DEFAULT_AUDIO_SETTINGS.noiseSuppression,
    autoGainControl: typeof rec?.autoGainControl === 'boolean' ? rec.autoGainControl : DEFAULT_AUDIO_SETTINGS.autoGainControl,
  };
}

export function parseBackup(json: string): SpeakFictionBackup {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const rec = asRecord(data);
  if (!rec) throw new Error('That file is not a SpeakFiction backup.');

  if (rec.kind === BACKUP_KIND_BOOK || (!rec.kind && rec.book)) {
    const book = normalizeBook(rec.book ?? rec);
    if (!book) throw new Error('That backup does not contain a book.');
    return {
      kind: BACKUP_KIND_BOOK,
      version: typeof rec.version === 'number' ? rec.version : BACKUP_FORMAT_VERSION,
      exportedAt: typeof rec.exportedAt === 'number' ? rec.exportedAt : Date.now(),
      book,
      series: normalizeSeries(rec.series),
    };
  }

  if (rec.kind === BACKUP_KIND_LIBRARY || Array.isArray(rec.books)) {
    const books = (Array.isArray(rec.books) ? rec.books : []).map(normalizeBook).filter((b): b is Book => Boolean(b));
    if (books.length === 0) throw new Error('That library backup has no books.');
    const series = (Array.isArray(rec.series) ? rec.series : [])
      .map(normalizeSeries)
      .filter((s): s is Series => Boolean(s));
    return {
      kind: BACKUP_KIND_LIBRARY,
      version: typeof rec.version === 'number' ? rec.version : BACKUP_FORMAT_VERSION,
      exportedAt: typeof rec.exportedAt === 'number' ? rec.exportedAt : Date.now(),
      series,
      books,
      activeBookId: typeof rec.activeBookId === 'string' ? rec.activeBookId : books[0]?.id ?? null,
      themeMode: rec.themeMode === 'light' || rec.themeMode === 'dark' ? rec.themeMode : DEFAULT_THEME_MODE,
      themeId: isThemeId(typeof rec.themeId === 'string' ? rec.themeId : null) ? rec.themeId as ThemeId : DEFAULT_THEME_ID,
      audioSettings: normalizeAudio(rec.audioSettings),
      sttProfileLabel: typeof rec.sttProfileLabel === 'string' ? rec.sttProfileLabel : null,
    };
  }

  throw new Error('That file is not a SpeakFiction book or library backup.');
}

export function backupToJson(backup: SpeakFictionBackup): string {
  return `${JSON.stringify(backup, null, 2)}\n`;
}
