import type { AdaptiveModelState, Book, InlineMark, Manuscript, ManuscriptImage, ManuscriptTable, NameEntry, NameVoiceClip, Series, TableCell } from './types';
import { emptyAdaptiveState } from './adaptiveModel';
import { DEFAULT_TENSE } from './tense';
import { DEFAULT_PERSPECTIVE } from './perspective';
import { DEFAULT_THEME_ID, DEFAULT_THEME_MODE, isGenreId, isThemeId, type ThemeId, type ThemeMode } from './theme';
import { DEFAULT_AUDIO_SETTINGS, type AudioSettings } from './audioSettings';
import { isManuscriptImageMime } from './manuscriptMedia';
import { INLINE_MARK_KINDS } from './richText';
import { parseSeriesBookNumber, normalizeSeriesBookFields } from './seriesBooks';

export const BACKUP_KIND_BOOK = 'speakfiction.book' as const;
export const BACKUP_KIND_LIBRARY = 'speakfiction.library' as const;
export const BACKUP_FORMAT_VERSION = 1;

export interface BookBackup {
  kind: typeof BACKUP_KIND_BOOK;
  version: number;
  exportedAt: number;
  book: Book;
  series?: Series | null;
  /** Image binaries keyed by mediaId so JSON backups carry pictures. */
  media?: Record<string, { mime: string; b64: string }>;
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
  media?: Record<string, { mime: string; b64: string }>;
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

export function serializeBookBackup(
  book: Book,
  series?: Series | null,
  media?: Record<string, { mime: string; b64: string }>,
): BookBackup {
  return {
    kind: BACKUP_KIND_BOOK,
    version: BACKUP_FORMAT_VERSION,
    exportedAt: Date.now(),
    book,
    series: series ?? null,
    media,
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
  media?: Record<string, { mime: string; b64: string }>;
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
    media: input.media,
  };
}

function isBackupMediaMime(mime: string): boolean {
  return isManuscriptImageMime(mime) || mime === 'audio/wav';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeBackupMedia(raw: unknown): Record<string, { mime: string; b64: string }> | undefined {
  const rec = asRecord(raw);
  if (!rec) return undefined;
  const out: Record<string, { mime: string; b64: string }> = {};
  for (const [id, value] of Object.entries(rec)) {
    const item = asRecord(value);
    if (!item || typeof item.b64 !== 'string' || !isBackupMediaMime(String(item.mime))) continue;
    out[id] = { mime: String(item.mime), b64: item.b64 };
  }
  return Object.keys(out).length ? out : undefined;
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

function normalizeMarks(raw: unknown): InlineMark[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const marks = raw
    .map((m) => asRecord(m))
    .filter((m): m is Record<string, unknown> => Boolean(m))
    .map((m) => ({
      kind: m.kind,
      start: typeof m.start === 'number' ? m.start : Number(m.start),
      end: typeof m.end === 'number' ? m.end : Number(m.end),
    }))
    .filter(
      (m): m is InlineMark =>
        INLINE_MARK_KINDS.includes(m.kind as InlineMark['kind']) &&
        Number.isFinite(m.start) &&
        Number.isFinite(m.end) &&
        m.end > m.start,
    )
    .map((m) => ({ kind: m.kind as InlineMark['kind'], start: m.start, end: m.end }));
  return marks.length ? marks : undefined;
}

function normalizeImage(raw: unknown): ManuscriptImage | undefined {
  const rec = asRecord(raw);
  if (!rec || typeof rec.mediaId !== 'string' || !rec.mediaId) return undefined;
  const mime = typeof rec.mime === 'string' ? rec.mime : '';
  if (!isManuscriptImageMime(mime)) return undefined;
  return {
    mediaId: rec.mediaId,
    mime,
    alt: typeof rec.alt === 'string' ? rec.alt : undefined,
    caption: typeof rec.caption === 'string' ? rec.caption : undefined,
    width: typeof rec.width === 'number' && Number.isFinite(rec.width) ? rec.width : undefined,
    height: typeof rec.height === 'number' && Number.isFinite(rec.height) ? rec.height : undefined,
  };
}

const BLOCK_TYPES = new Set(['chapter', 'scene', 'section', 'paragraph', 'image', 'table']);

function normalizeTable(raw: unknown): ManuscriptTable | undefined {
  const rec = asRecord(raw);
  const rowsRaw = rec && Array.isArray(rec.rows) ? rec.rows : Array.isArray(raw) ? raw : null;
  if (!rowsRaw || !rowsRaw.length) return undefined;
  const rows: TableCell[][] = [];
  for (const row of rowsRaw) {
    if (!Array.isArray(row)) continue;
    const cells: TableCell[] = [];
    for (const cell of row) {
      if (typeof cell === 'string') {
        cells.push({ text: cell });
        continue;
      }
      const item = asRecord(cell);
      cells.push({ text: typeof item?.text === 'string' ? item.text : '' });
    }
    if (cells.length) rows.push(cells);
  }
  return rows.length ? { rows } : undefined;
}

function normalizeManuscript(raw: unknown): Manuscript {
  const rec = asRecord(raw);
  const blocks = rec && Array.isArray(rec.blocks) ? rec.blocks : [];
  return {
    blocks: blocks
      .map((b) => asRecord(b))
      .filter((b): b is Record<string, unknown> =>
        Boolean(b && typeof b.id === 'string' && typeof b.type === 'string' && BLOCK_TYPES.has(String(b.type))),
      )
      .map((b) => {
        const type = b.type as Manuscript['blocks'][number]['type'];
        const block: Manuscript['blocks'][number] = {
          id: String(b.id),
          type,
          title: typeof b.title === 'string' ? b.title : undefined,
          text: typeof b.text === 'string' ? b.text : undefined,
        };
        const marks = normalizeMarks(b.marks);
        if (marks) block.marks = marks;
        if (type === 'image') {
          const image = normalizeImage(b.image);
          if (image) block.image = image;
        }
        if (type === 'table') {
          const table = normalizeTable(b.table);
          if (table) block.table = table;
        }
        return block;
      }),
  };
}

function normalizeNameVoiceClips(raw: unknown): NameVoiceClip[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const clips = raw
    .map((c) => asRecord(c))
    .filter((c): c is Record<string, unknown> => Boolean(c && typeof c.mediaId === 'string' && c.mediaId))
    .map((c) => {
      const clip: NameVoiceClip = { mediaId: String(c.mediaId) };
      if (typeof c.heard === 'string' && c.heard.trim()) clip.heard = c.heard.trim();
      if (c.source === 'library' || c.source === 'dictation') clip.source = c.source;
      return clip;
    });
  return clips.length ? clips : undefined;
}

function normalizeNameLibrary(raw: unknown): NameEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((n) => asRecord(n))
    .filter((n): n is Record<string, unknown> => Boolean(n && typeof n.id === 'string' && typeof n.canonical === 'string'))
    .map((n) => {
      const entry: NameEntry = {
        id: String(n.id),
        canonical: String(n.canonical),
        category: (typeof n.category === 'string' ? n.category : 'other') as NameEntry['category'],
        aliases: Array.isArray(n.aliases) ? n.aliases.map(String) : [],
        note: typeof n.note === 'string' ? n.note : undefined,
        originBookId: typeof n.originBookId === 'string' && n.originBookId ? n.originBookId : undefined,
      };
      const voiceClips = normalizeNameVoiceClips(n.voiceClips);
      if (voiceClips) entry.voiceClips = voiceClips;
      return entry;
    });
}

export function normalizeBook(raw: unknown): Book | null {
  const rec = asRecord(raw);
  if (!rec || typeof rec.id !== 'string' || typeof rec.title !== 'string') return null;
  const genreId = typeof rec.genreId === 'string' ? rec.genreId : '';
  return normalizeSeriesBookFields({
    id: rec.id,
    title: rec.title,
    seriesId: typeof rec.seriesId === 'string' ? rec.seriesId : undefined,
    seriesBookNumber: parseSeriesBookNumber(rec.seriesBookNumber),
    genreId: isGenreId(genreId) ? genreId : 'generic',
    tenseId: (typeof rec.tenseId === 'string' ? rec.tenseId : DEFAULT_TENSE) as Book['tenseId'],
    perspectiveId: (typeof rec.perspectiveId === 'string' ? rec.perspectiveId : DEFAULT_PERSPECTIVE) as Book['perspectiveId'],
    nameLibrary: normalizeNameLibrary(rec.nameLibrary),
    manuscript: normalizeManuscript(rec.manuscript),
    adaptive: normalizeAdaptive(rec.adaptive),
    createdAt: typeof rec.createdAt === 'number' ? rec.createdAt : Date.now(),
    updatedAt: typeof rec.updatedAt === 'number' ? rec.updatedAt : Date.now(),
  });
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
      media: normalizeBackupMedia(rec.media),
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
      media: normalizeBackupMedia(rec.media),
    };
  }

  throw new Error('That file is not a SpeakFiction book or library backup.');
}

export function backupToJson(backup: SpeakFictionBackup): string {
  return `${JSON.stringify(backup, null, 2)}\n`;
}
