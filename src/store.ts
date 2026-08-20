import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  Book,
  GenreId,
  InlineMark,
  InlineMarkKind,
  ManuscriptImage,
  NameCategory,
  NameEntry,
  PerspectiveId,
  Series,
  TenseId,
} from './core/types';
import { emptyAdaptiveState } from './core/adaptiveModel';
import {
  emptyManuscript,
  formatParagraph,
  insertEmptyStructure,
  insertImageBlock,
  insertSegments,
  insertTableBlock,
  moveBlockRange,
  setBlockKind,
  setBlockTitle,
  setImageAlt,
  setImageCaption,
  setParagraphContent,
  setTableCellText,
  trimEmptyBlocks,
  unwrapHeading,
  deleteMovableRange,
  blocksInMovableRange,
  type ManuscriptInsertAt,
  type ManuscriptInsertKind,
  type StructureHeadingKind,
} from './core/manuscript';
import { removeMedia } from './core/mediaStore';
import {
  cloneDraft,
  popVoiceCommandSnapshot,
  pushVoiceCommandSnapshot,
  type VoiceCommandSnapshot,
} from './core/voiceCommandUndo';
import { processTranscript } from './core/dictationProcessor';
import { getGenre } from './core/genres';
import { DEFAULT_TENSE } from './core/tense';
import { DEFAULT_PERSPECTIVE } from './core/perspective';
import { DEFAULT_THEME_ID, DEFAULT_THEME_MODE, type ThemeId, type ThemeMode } from './core/theme';
import {
  isAppTab,
  normalizeDictationDrafts,
  normalizeLastSeenVersion,
  normalizeManuscriptEditorOpen,
  normalizeManuscriptPlace,
  normalizeThemeId,
  normalizeThemeMode,
  omitKey,
  PERSIST_NAME,
  PERSIST_VERSION,
  type AppTab,
  type ManuscriptPlace,
} from './core/persistedState';
import { sessionStateStorage } from './core/sessionStorage';
import { DICTATE_SPLIT_DEFAULT, MANUSCRIPT_SPLIT_DEFAULT, normalizeDictateSplit, normalizeManuscriptSplit } from './core/splitRatio';
import { uid } from './core/util';
import type { AppliedCorrection } from './core/nameLibrary';
import { bookIdOwningName, mergeSeriesNameLibrary } from './core/seriesNames';
import type { SpokenCharacter } from './core/newCharacterCue';
import type { DictationDraft } from './core/dictationDraft';
import {
  EMBER_KING_SERIES,
  EMBER_KING_TITLE,
  emberKingSampleManuscript,
  isTinyEmberKingSeed,
  relabelEmberKingExample,
  relabelEmberKingSeries,
} from './core/seedManuscript';
import { DEFAULT_AUDIO_SETTINGS, type AudioSettings } from './core/audioSettings';
import type { BookBackup, LibraryBackup } from './core/backup';
import {
  applySeriesAssignment,
  applySeriesBookNumber,
  normalizeSeriesBookFields,
} from './core/seriesBooks';

export interface DictationOutcome {
  corrections: AppliedCorrection[];
  structureAdded: number;
  wordsAdded: number;
}

export type { AudioSettings };
export { DEFAULT_AUDIO_SETTINGS };

interface AppState {
  series: Series[];
  books: Book[];
  activeBookId: string | null;
  themeMode: ThemeMode;
  themeId: ThemeId;
  setThemeMode: (mode: ThemeMode) => void;
  setThemeId: (id: ThemeId) => void;
  audioSettings: AudioSettings;
  setAudioSettings: (patch: Partial<AudioSettings>) => void;
  sttProfileLabel: string | null;
  rememberSttProfile: (label: string) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  dictateSplit: number;
  setDictateSplit: (ratio: number) => void;
  manuscriptSplit: number;
  setManuscriptSplit: (ratio: number) => void;
  manuscriptEditorOpen: boolean;
  setManuscriptEditorOpen: (open: boolean) => void;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  dictationDrafts: Record<string, DictationDraft>;
  setDictationDraft: (bookId: string, draft: DictationDraft) => void;
  manuscriptPlace: Record<string, ManuscriptPlace>;
  setManuscriptPlace: (bookId: string, place: ManuscriptPlace) => void;
  lastSeenVersion: string | null;
  setLastSeenVersion: (version: string) => void;
  manuscriptHistory: Record<string, { past: Book['manuscript']['blocks'][]; future: Book['manuscript']['blocks'][] }>;
  /** Session-only snapshots taken before spoken/chip dictation commands. Not persisted. */
  voiceCommandUndo: Record<string, VoiceCommandSnapshot[]>;

  createSeries: (name: string) => string;
  createBook: (title: string, genreId: GenreId, seriesId?: string) => string;
  deleteBook: (id: string) => void;
  setActiveBook: (id: string) => void;
  setGenre: (bookId: string, genreId: GenreId) => void;
  setTense: (bookId: string, tenseId: TenseId) => void;
  setPerspective: (bookId: string, perspectiveId: PerspectiveId) => void;
  renameBook: (bookId: string, title: string) => void;
  setBookSeries: (bookId: string, seriesId?: string) => void;
  setSeriesBookNumber: (bookId: string, value: unknown) => void;

  addNameEntry: (bookId: string, entry: Omit<NameEntry, 'id'>) => void;
  updateNameEntry: (bookId: string, entry: NameEntry) => void;
  removeNameEntry: (bookId: string, entryId: string) => void;

  applyDictation: (
    bookId: string,
    transcript: string,
    dest?: ManuscriptInsertAt,
  ) => DictationOutcome;
  updateBlockText: (bookId: string, blockId: string, text: string, marks?: InlineMark[]) => void;
  updateBlockTitle: (bookId: string, blockId: string, title: string) => void;
  deleteBlock: (bookId: string, blockId: string) => void;
  deleteBlockRange: (bookId: string, blockId: string) => void;
  unwrapHeading: (bookId: string, blockId: string) => void;
  moveManuscriptRange: (bookId: string, fromIndex: number, dropIndex: number) => void;
  insertManuscriptStructure: (
    bookId: string,
    kind: ManuscriptInsertKind,
    dest?: ManuscriptInsertAt,
  ) => void;
  insertManuscriptImage: (bookId: string, image: ManuscriptImage, dest?: ManuscriptInsertAt) => void;
  insertManuscriptTable: (bookId: string, rows: number, cols: number, dest?: ManuscriptInsertAt) => void;
  updateTableCell: (bookId: string, blockId: string, row: number, col: number, text: string) => void;
  formatManuscript: (
    bookId: string,
    blockId: string,
    range: { start: number; end: number },
    action: { type: 'toggle'; kind: InlineMarkKind } | { type: 'clear' },
  ) => void;
  setManuscriptBlockKind: (bookId: string, blockId: string, kind: StructureHeadingKind) => void;
  updateImageCaption: (bookId: string, blockId: string, caption: string) => void;
  updateImageAlt: (bookId: string, blockId: string, alt: string) => void;
  undoManuscript: (bookId: string) => void;
  redoManuscript: (bookId: string) => void;
  clearManuscript: (bookId: string) => void;
  captureVoiceCommand: (bookId: string) => void;
  undoLastVoiceCommand: (bookId: string) => boolean;

  importBookBackup: (backup: BookBackup, replaceExisting: boolean) => 'added' | 'replaced' | 'exists';
  importLibraryBackup: (backup: LibraryBackup, mode: 'merge' | 'replace') => void;
}

function seedBook(): { series: Series[]; book: Book } {
  const seriesId = uid('ser');
  const now = Date.now();
  const nameLibrary: NameEntry[] = [
    { id: uid('n'), canonical: 'Kaeldros', category: 'character', aliases: ['kaldros', 'kel dros'], note: 'exiled swordmaster' },
    { id: uid('n'), canonical: 'Aelith', category: 'character', aliases: ['aleith', 'a lith'], note: 'oracle of the deep' },
    { id: uid('n'), canonical: 'Vaelthorn Keep', category: 'location', aliases: ['valthorn keep', 'vale thorn keep'] },
    { id: uid('n'), canonical: 'Sunspar', category: 'item', aliases: ['sun spar'], note: 'the shard-blade' },
    { id: uid('n'), canonical: 'The Ashen Order', category: 'organization', aliases: ['ashen order'] },
  ];

  const book: Book = {
    id: uid('bk'),
    title: EMBER_KING_TITLE,
    seriesId,
    seriesBookNumber: 1,
    genreId: 'fantasy',
    tenseId: DEFAULT_TENSE,
    perspectiveId: DEFAULT_PERSPECTIVE,
    nameLibrary,
    manuscript: emberKingSampleManuscript(),
    adaptive: emptyAdaptiveState(),
    createdAt: now,
    updatedAt: now,
  };

  return { series: [{ id: seriesId, name: EMBER_KING_SERIES }], book };
}

function patchBook(books: Book[], id: string, fn: (b: Book) => Book): Book[] {
  return books.map((b) => (b.id === id ? { ...fn(b), updatedAt: Date.now() } : b));
}

function uniqueAliases(existing: string[], incoming: string[]): string[] {
  const aliases = [...existing];
  for (const alias of incoming) {
    if (!aliases.some((a) => a.toLowerCase() === alias.toLowerCase())) aliases.push(alias);
  }
  return aliases;
}

function upsertNameOnBook(books: Book[], originBookId: string, payload: Omit<NameEntry, 'id'>): Book[] {
  const origin = books.find((b) => b.id === originBookId);
  if (!origin) return books;
  const merged = mergeSeriesNameLibrary(books, origin);
  const existing = merged.find(
    (n) =>
      n.category === (payload.category ?? 'character') &&
      n.canonical.toLowerCase() === payload.canonical.toLowerCase(),
  );
  if (existing) {
    const ownerId = bookIdOwningName(books, existing.id) ?? originBookId;
    return patchBook(books, ownerId, (b) => ({
      ...b,
      nameLibrary: b.nameLibrary.map((n) =>
        n.id === existing.id
          ? {
              ...n,
              aliases: uniqueAliases(n.aliases, payload.aliases),
              note: n.note || payload.note,
              originBookId: n.originBookId || originBookId,
            }
          : n,
      ),
    }));
  }
  return patchBook(books, originBookId, (b) => ({
    ...b,
    nameLibrary: [
      ...b.nameLibrary,
      {
        ...payload,
        id: uid('n'),
        originBookId: payload.originBookId || originBookId,
      },
    ],
  }));
}

function upsertSpokenCharacters(books: Book[], originBookId: string, spoken: SpokenCharacter[]): Book[] {
  let next = books;
  for (const ch of spoken) {
    next = upsertNameOnBook(next, originBookId, {
      canonical: ch.canonical,
      category: 'character',
      aliases: ch.aliases,
      originBookId,
    });
  }
  return next;
}

/** Expand the original one-paragraph Ember King sample; leave user-created books alone. */
function reseedTinyEmberKing(books: Book[]): Book[] {
  if (books.length !== 1 || !isTinyEmberKingSeed(books[0])) return books;
  return [
    {
      ...books[0],
      manuscript: emberKingSampleManuscript(),
      updatedAt: Date.now(),
    },
  ];
}

function relabelExampleStory(books: Book[], series: Series[]): { books: Book[]; series: Series[] } {
  return {
    books: books.map(relabelEmberKingExample),
    series: series.map(relabelEmberKingSeries),
  };
}

function dropImageMedia(blocks: Book['manuscript']['blocks']): void {
  for (const b of blocks) {
    if (b.type === 'image' && b.image) void removeMedia(b.image.mediaId);
  }
}

function pushHistory(
  s: { manuscriptHistory: AppState['manuscriptHistory']; books: Book[] },
  bookId: string,
): AppState['manuscriptHistory'] {
  const book = s.books.find((b) => b.id === bookId);
  if (!book) return s.manuscriptHistory;
  const hist = s.manuscriptHistory[bookId] ?? { past: [], future: [] };
  return {
    ...s.manuscriptHistory,
    [bookId]: { past: [...hist.past, book.manuscript.blocks].slice(-50), future: [] },
  };
}

const seed = seedBook();

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      series: seed.series,
      books: [seed.book],
      activeBookId: seed.book.id,
      themeMode: DEFAULT_THEME_MODE,
      themeId: DEFAULT_THEME_ID,
      setThemeMode: (mode) => set({ themeMode: mode }),
      setThemeId: (id) => set({ themeId: id }),
      audioSettings: { ...DEFAULT_AUDIO_SETTINGS },
      setAudioSettings: (patch) =>
        set((s) => ({ audioSettings: { ...s.audioSettings, ...patch } })),
      sttProfileLabel: null,
      rememberSttProfile: (label) => set({ sttProfileLabel: label }),
      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      dictateSplit: DICTATE_SPLIT_DEFAULT,
      setDictateSplit: (ratio) => set({ dictateSplit: normalizeDictateSplit(ratio) }),
      manuscriptSplit: MANUSCRIPT_SPLIT_DEFAULT,
      setManuscriptSplit: (ratio) => set({ manuscriptSplit: normalizeManuscriptSplit(ratio) }),
      manuscriptEditorOpen: false,
      setManuscriptEditorOpen: (open) => set({ manuscriptEditorOpen: Boolean(open) }),
      activeTab: 'dictate',
      setActiveTab: (tab) => set({ activeTab: tab }),
      dictationDrafts: {},
      setDictationDraft: (bookId, draft) =>
        set((s) => ({ dictationDrafts: { ...s.dictationDrafts, [bookId]: draft } })),
      manuscriptPlace: {},
      setManuscriptPlace: (bookId, place) =>
        set((s) => ({ manuscriptPlace: { ...s.manuscriptPlace, [bookId]: place } })),
      lastSeenVersion: null,
      setLastSeenVersion: (version) => set({ lastSeenVersion: normalizeLastSeenVersion(version) }),
      manuscriptHistory: {},
      voiceCommandUndo: {},

      createSeries: (name) => {
        const id = uid('ser');
        set((s) => ({ series: [...s.series, { id, name }] }));
        return id;
      },

      createBook: (title, genreId, seriesId) => {
        const id = uid('bk');
        const now = Date.now();
        const book: Book = {
          id,
          title,
          seriesId,
          genreId,
          tenseId: DEFAULT_TENSE,
          perspectiveId: DEFAULT_PERSPECTIVE,
          nameLibrary: [],
          manuscript: emptyManuscript(),
          adaptive: emptyAdaptiveState(),
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ books: [...s.books, book], activeBookId: id }));
        return id;
      },

      deleteBook: (id) =>
        set((s) => {
          const books = s.books.filter((b) => b.id !== id);
          return {
            books,
            dictationDrafts: omitKey(s.dictationDrafts, id),
            manuscriptPlace: omitKey(s.manuscriptPlace, id),
            manuscriptHistory: omitKey(s.manuscriptHistory, id),
            voiceCommandUndo: omitKey(s.voiceCommandUndo, id),
            activeBookId: s.activeBookId === id ? books[0]?.id ?? null : s.activeBookId,
          };
        }),

      setActiveBook: (id) => set({ activeBookId: id }),

      setGenre: (bookId, genreId) =>
        set((s) => ({ books: patchBook(s.books, bookId, (b) => ({ ...b, genreId })) })),

      setTense: (bookId, tenseId) =>
        set((s) => ({ books: patchBook(s.books, bookId, (b) => ({ ...b, tenseId })) })),

      setPerspective: (bookId, perspectiveId) =>
        set((s) => ({ books: patchBook(s.books, bookId, (b) => ({ ...b, perspectiveId })) })),

      renameBook: (bookId, title) =>
        set((s) => ({ books: patchBook(s.books, bookId, (b) => ({ ...b, title })) })),

      setBookSeries: (bookId, seriesId) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => applySeriesAssignment(b, seriesId)),
        })),

      setSeriesBookNumber: (bookId, value) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => applySeriesBookNumber(b, value)),
        })),

      addNameEntry: (bookId, entry) =>
        set((s) => ({
          books: upsertNameOnBook(s.books, bookId, { ...entry, originBookId: entry.originBookId || bookId }),
        })),

      updateNameEntry: (bookId, entry) =>
        set((s) => {
          const ownerId = bookIdOwningName(s.books, entry.id) ?? bookId;
          return {
            books: patchBook(s.books, ownerId, (b) => ({
              ...b,
              nameLibrary: b.nameLibrary.map((n) =>
                n.id === entry.id ? { ...entry, originBookId: n.originBookId || ownerId } : n,
              ),
            })),
          };
        }),

      removeNameEntry: (bookId, entryId) =>
        set((s) => {
          const ownerId = bookIdOwningName(s.books, entryId) ?? bookId;
          return {
            books: patchBook(s.books, ownerId, (b) => ({
              ...b,
              nameLibrary: b.nameLibrary.filter((n) => n.id !== entryId),
            })),
          };
        }),

      applyDictation: (bookId, transcript, dest) => {
        const book = get().books.find((b) => b.id === bookId);
        if (!book) return { corrections: [], structureAdded: 0, wordsAdded: 0 };
        // Manuscript only. The view clears the transcription staging buffer after a successful promote.

        const result = processTranscript(transcript, {
          entries: mergeSeriesNameLibrary(get().books, book),
          genre: getGenre(book.genreId),
          tense: book.tenseId ?? DEFAULT_TENSE,
          perspective: book.perspectiveId ?? DEFAULT_PERSPECTIVE,
          adaptive: book.adaptive,
        });

        const newBlocks = trimEmptyBlocks(
          insertSegments(book.manuscript.blocks, result.segments, dest),
        );
        const structureAdded = result.segments.filter(
          (s) => s.type === 'structure' && s.event.kind !== 'paragraph',
        ).length;
        const wordsAdded = result.segments
          .filter((s) => s.type === 'text')
          .reduce((acc, s) => acc + (s.type === 'text' ? s.text.trim().split(/\s+/).filter(Boolean).length : 0), 0);

        set((state) => {
          let books = patchBook(state.books, bookId, (b) => ({
            ...b,
            manuscript: { blocks: newBlocks },
            adaptive: result.adaptive,
          }));
          books = upsertSpokenCharacters(books, bookId, result.newCharacters);
          return { books };
        });

        return { corrections: result.corrections, structureAdded, wordsAdded };
      },

      updateBlockText: (bookId, blockId, text, marks) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            manuscript: {
              blocks: setParagraphContent(b.manuscript.blocks, blockId, text, marks),
            },
          })),
        })),

      updateBlockTitle: (bookId, blockId, title) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            manuscript: { blocks: setBlockTitle(b.manuscript.blocks, blockId, title) },
          })),
        })),

      deleteBlock: (bookId, blockId) =>
        set((s) => {
          const book = s.books.find((b) => b.id === bookId);
          const victim = book?.manuscript.blocks.find((blk) => blk.id === blockId);
          if (victim?.type === 'image' && victim.image) void removeMedia(victim.image.mediaId);
          return {
            books: patchBook(s.books, bookId, (b) => ({
              ...b,
              manuscript: { blocks: b.manuscript.blocks.filter((blk) => blk.id !== blockId) },
            })),
            manuscriptHistory: pushHistory(s, bookId),
          };
        }),

      unwrapHeading: (bookId, blockId) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            manuscript: { blocks: unwrapHeading(b.manuscript.blocks, blockId) },
          })),
          manuscriptHistory: pushHistory(s, bookId),
        })),

      deleteBlockRange: (bookId, blockId) =>
        set((s) => {
          const book = s.books.find((b) => b.id === bookId);
          if (book) dropImageMedia(blocksInMovableRange(book.manuscript.blocks, blockId));
          return {
            books: patchBook(s.books, bookId, (b) => ({
              ...b,
              manuscript: { blocks: deleteMovableRange(b.manuscript.blocks, blockId) },
            })),
            manuscriptHistory: pushHistory(s, bookId),
          };
        }),

      moveManuscriptRange: (bookId, fromIndex, dropIndex) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            manuscript: { blocks: moveBlockRange(b.manuscript.blocks, fromIndex, dropIndex) },
          })),
          manuscriptHistory: pushHistory(s, bookId),
        })),

      insertManuscriptStructure: (bookId, kind, dest) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            manuscript: { blocks: insertEmptyStructure(b.manuscript.blocks, kind, dest) },
          })),
          manuscriptHistory: pushHistory(s, bookId),
        })),

      insertManuscriptImage: (bookId, image, dest) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            manuscript: { blocks: insertImageBlock(b.manuscript.blocks, image, dest) },
          })),
          manuscriptHistory: pushHistory(s, bookId),
        })),

      insertManuscriptTable: (bookId, rows, cols, dest) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            manuscript: { blocks: insertTableBlock(b.manuscript.blocks, rows, cols, dest) },
          })),
          manuscriptHistory: pushHistory(s, bookId),
        })),

      updateTableCell: (bookId, blockId, row, col, text) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            manuscript: { blocks: setTableCellText(b.manuscript.blocks, blockId, row, col, text) },
          })),
        })),

      formatManuscript: (bookId, blockId, range, action) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            manuscript: { blocks: formatParagraph(b.manuscript.blocks, blockId, range, action) },
          })),
          manuscriptHistory: pushHistory(s, bookId),
        })),

      setManuscriptBlockKind: (bookId, blockId, kind) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            manuscript: { blocks: setBlockKind(b.manuscript.blocks, blockId, kind) },
          })),
          manuscriptHistory: pushHistory(s, bookId),
        })),

      updateImageCaption: (bookId, blockId, caption) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            manuscript: { blocks: setImageCaption(b.manuscript.blocks, blockId, caption) },
          })),
        })),

      updateImageAlt: (bookId, blockId, alt) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            manuscript: { blocks: setImageAlt(b.manuscript.blocks, blockId, alt) },
          })),
        })),

      undoManuscript: (bookId) =>
        set((s) => {
          const book = s.books.find((b) => b.id === bookId);
          const hist = s.manuscriptHistory[bookId];
          if (!book || !hist?.past.length) return s;
          const prev = hist.past[hist.past.length - 1];
          return {
            books: patchBook(s.books, bookId, (b) => ({ ...b, manuscript: { blocks: prev } })),
            manuscriptHistory: {
              ...s.manuscriptHistory,
              [bookId]: {
                past: hist.past.slice(0, -1),
                future: [book.manuscript.blocks, ...hist.future].slice(0, 50),
              },
            },
          };
        }),

      redoManuscript: (bookId) =>
        set((s) => {
          const book = s.books.find((b) => b.id === bookId);
          const hist = s.manuscriptHistory[bookId];
          if (!book || !hist?.future.length) return s;
          const next = hist.future[0];
          return {
            books: patchBook(s.books, bookId, (b) => ({ ...b, manuscript: { blocks: next } })),
            manuscriptHistory: {
              ...s.manuscriptHistory,
              [bookId]: {
                past: [...hist.past, book.manuscript.blocks].slice(-50),
                future: hist.future.slice(1),
              },
            },
          };
        }),

      clearManuscript: (bookId) =>
        set((s) => {
          const book = s.books.find((b) => b.id === bookId);
          if (book) dropImageMedia(book.manuscript.blocks);
          return {
            books: patchBook(s.books, bookId, (b) => ({ ...b, manuscript: emptyManuscript() })),
            manuscriptHistory: pushHistory(s, bookId),
            voiceCommandUndo: omitKey(s.voiceCommandUndo, bookId),
          };
        }),

      captureVoiceCommand: (bookId) =>
        set((s) => {
          const book = s.books.find((b) => b.id === bookId);
          if (!book) return s;
          const snap: VoiceCommandSnapshot = {
            draft: cloneDraft(s.dictationDrafts[bookId] ?? []),
            blocks: book.manuscript.blocks,
          };
          return {
            voiceCommandUndo: {
              ...s.voiceCommandUndo,
              [bookId]: pushVoiceCommandSnapshot(s.voiceCommandUndo[bookId] ?? [], snap),
            },
          };
        }),

      undoLastVoiceCommand: (bookId) => {
        const s = get();
        const { stack, snap } = popVoiceCommandSnapshot(s.voiceCommandUndo[bookId] ?? []);
        if (!snap) return false;
        set({
          voiceCommandUndo: { ...s.voiceCommandUndo, [bookId]: stack },
          dictationDrafts: { ...s.dictationDrafts, [bookId]: snap.draft },
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            manuscript: { blocks: snap.blocks },
          })),
        });
        return true;
      },

      importBookBackup: (backup, replaceExisting) => {
        const incoming = { ...backup.book, updatedAt: Date.now() };
        const existing = get().books.some((b) => b.id === incoming.id);
        if (existing && !replaceExisting) return 'exists';
        set((s) => {
          let series = s.series;
          if (backup.series) {
            const incoming = backup.series;
            series = series.some((x) => x.id === incoming.id)
              ? series.map((x) => (x.id === incoming.id ? incoming : x))
              : [...series, incoming];
          }
          const books = existing
            ? s.books.map((b) => (b.id === incoming.id ? incoming : b))
            : [...s.books, incoming];
          return { series, books, activeBookId: incoming.id };
        });
        return existing ? 'replaced' : 'added';
      },

      importLibraryBackup: (backup, mode) => {
        if (mode === 'replace') {
          set({
            series: backup.series,
            books: backup.books,
            activeBookId: backup.activeBookId ?? backup.books[0]?.id ?? null,
            themeMode: backup.themeMode,
            themeId: backup.themeId,
            audioSettings: backup.audioSettings,
            sttProfileLabel: backup.sttProfileLabel ?? get().sttProfileLabel,
          });
          return;
        }
        set((s) => {
          const seriesById = new Map(s.series.map((x) => [x.id, x]));
          for (const ser of backup.series) seriesById.set(ser.id, ser);
          const booksById = new Map(s.books.map((b) => [b.id, b]));
          for (const book of backup.books) booksById.set(book.id, book);
          return {
            series: [...seriesById.values()],
            books: [...booksById.values()],
            activeBookId: backup.activeBookId && booksById.has(backup.activeBookId)
              ? backup.activeBookId
              : s.activeBookId,
          };
        });
      },
    }),
    {
      name: PERSIST_NAME,
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => sessionStateStorage),
      skipHydration: true,
      partialize: (s) => ({
        series: s.series,
        books: s.books,
        activeBookId: s.activeBookId,
        themeMode: s.themeMode,
        themeId: s.themeId,
        audioSettings: s.audioSettings,
        sttProfileLabel: s.sttProfileLabel,
        sidebarCollapsed: s.sidebarCollapsed,
        dictateSplit: s.dictateSplit,
        manuscriptSplit: s.manuscriptSplit,
        manuscriptEditorOpen: s.manuscriptEditorOpen,
        activeTab: s.activeTab,
        dictationDrafts: s.dictationDrafts,
        manuscriptPlace: s.manuscriptPlace,
        lastSeenVersion: s.lastSeenVersion,
      }),
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        let books = (p.books ?? []).map((b) =>
          normalizeSeriesBookFields({
            ...b,
            tenseId: b.tenseId ?? DEFAULT_TENSE,
            perspectiveId: b.perspectiveId ?? DEFAULT_PERSPECTIVE,
          }),
        );
        let series = p.series ?? [];
        if (version < 2) books = reseedTinyEmberKing(books);
        if (version < 3) {
          const relabeled = relabelExampleStory(books, series);
          books = relabeled.books;
          series = relabeled.series;
        }
        return {
          ...p,
          books,
          series,
          dictationDrafts: normalizeDictationDrafts(p.dictationDrafts),
          manuscriptPlace: normalizeManuscriptPlace(p.manuscriptPlace),
          // Missing lastSeenVersion stays null — do not fill with the running version.
          lastSeenVersion: normalizeLastSeenVersion(p.lastSeenVersion),
          manuscriptEditorOpen: normalizeManuscriptEditorOpen(p.manuscriptEditorOpen),
          activeTab: isAppTab(p.activeTab) ? p.activeTab : 'dictate',
        };
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return {
          ...current,
          ...p,
          audioSettings: { ...current.audioSettings, ...p.audioSettings },
          sttProfileLabel: p.sttProfileLabel ?? current.sttProfileLabel,
          themeMode: normalizeThemeMode(p.themeMode, DEFAULT_THEME_MODE),
          themeId: normalizeThemeId(p.themeId, DEFAULT_THEME_ID),
          sidebarCollapsed: Boolean(p.sidebarCollapsed),
          dictateSplit: normalizeDictateSplit(p.dictateSplit, current.dictateSplit),
          manuscriptSplit: normalizeManuscriptSplit(p.manuscriptSplit, current.manuscriptSplit),
          manuscriptEditorOpen: normalizeManuscriptEditorOpen(p.manuscriptEditorOpen),
          activeTab: isAppTab(p.activeTab) ? p.activeTab : current.activeTab,
          dictationDrafts: normalizeDictationDrafts(p.dictationDrafts),
          manuscriptPlace: normalizeManuscriptPlace(p.manuscriptPlace),
          // Persist is source of truth. Defaulting to current.lastSeenVersion or the
          // running app version would hide upgrades from installs that never wrote it.
          lastSeenVersion: normalizeLastSeenVersion(p.lastSeenVersion),
          books: (p.books ?? current.books).map((b) =>
            normalizeSeriesBookFields({
              ...b,
              tenseId: b.tenseId ?? DEFAULT_TENSE,
              perspectiveId: b.perspectiveId ?? DEFAULT_PERSPECTIVE,
            }),
          ),
          series: p.series ?? current.series,
          voiceCommandUndo: current.voiceCommandUndo,
        };
      },
    },
  ),
);

export const CATEGORY_LABELS: Record<NameCategory, string> = {
  character: 'Character',
  location: 'Location',
  item: 'Item',
  organization: 'Organization',
  other: 'Other',
};
