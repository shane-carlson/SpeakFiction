import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  Book,
  GenreId,
  NameCategory,
  NameEntry,
  PerspectiveId,
  Series,
  TenseId,
} from './core/types';
import { emptyAdaptiveState } from './core/adaptiveModel';
import {
  emptyManuscript,
  insertSegments,
  trimEmptyBlocks,
  type ManuscriptInsertAt,
} from './core/manuscript';
import { processTranscript } from './core/dictationProcessor';
import { getGenre } from './core/genres';
import { DEFAULT_TENSE } from './core/tense';
import { DEFAULT_PERSPECTIVE } from './core/perspective';
import { DEFAULT_THEME_ID, DEFAULT_THEME_MODE, type ThemeId, type ThemeMode } from './core/theme';
import {
  isAppTab,
  normalizeDictationDrafts,
  normalizeLastSeenVersion,
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
import { uid } from './core/util';
import type { AppliedCorrection } from './core/nameLibrary';
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
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  dictationDrafts: Record<string, DictationDraft>;
  setDictationDraft: (bookId: string, draft: DictationDraft) => void;
  manuscriptPlace: Record<string, ManuscriptPlace>;
  setManuscriptPlace: (bookId: string, place: ManuscriptPlace) => void;
  lastSeenVersion: string | null;
  setLastSeenVersion: (version: string) => void;

  createSeries: (name: string) => string;
  createBook: (title: string, genreId: GenreId, seriesId?: string) => string;
  deleteBook: (id: string) => void;
  setActiveBook: (id: string) => void;
  setGenre: (bookId: string, genreId: GenreId) => void;
  setTense: (bookId: string, tenseId: TenseId) => void;
  setPerspective: (bookId: string, perspectiveId: PerspectiveId) => void;
  renameBook: (bookId: string, title: string) => void;
  setBookSeries: (bookId: string, seriesId?: string) => void;

  addNameEntry: (bookId: string, entry: Omit<NameEntry, 'id'>) => void;
  updateNameEntry: (bookId: string, entry: NameEntry) => void;
  removeNameEntry: (bookId: string, entryId: string) => void;

  applyDictation: (
    bookId: string,
    transcript: string,
    dest?: ManuscriptInsertAt,
  ) => DictationOutcome;
  updateBlockText: (bookId: string, blockId: string, text: string) => void;
  deleteBlock: (bookId: string, blockId: string) => void;
  clearManuscript: (bookId: string) => void;

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
      dictateSplit: 0.48,
      setDictateSplit: (ratio) => set({ dictateSplit: ratio }),
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
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            seriesId: seriesId || undefined,
          })),
        })),

      addNameEntry: (bookId, entry) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            nameLibrary: [...b.nameLibrary, { ...entry, id: uid('n') }],
          })),
        })),

      updateNameEntry: (bookId, entry) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            nameLibrary: b.nameLibrary.map((n) => (n.id === entry.id ? entry : n)),
          })),
        })),

      removeNameEntry: (bookId, entryId) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            nameLibrary: b.nameLibrary.filter((n) => n.id !== entryId),
          })),
        })),

      applyDictation: (bookId, transcript, dest) => {
        const book = get().books.find((b) => b.id === bookId);
        if (!book) return { corrections: [], structureAdded: 0, wordsAdded: 0 };
        // Manuscript only. The view clears the transcription staging buffer after a successful promote.

        const result = processTranscript(transcript, {
          entries: book.nameLibrary,
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

        set((state) => ({
          books: patchBook(state.books, bookId, (b) => ({
            ...b,
            manuscript: { blocks: newBlocks },
            adaptive: result.adaptive,
          })),
        }));

        return { corrections: result.corrections, structureAdded, wordsAdded };
      },

      updateBlockText: (bookId, blockId, text) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            manuscript: {
              blocks: b.manuscript.blocks.map((blk) =>
                blk.id === blockId ? { ...blk, text } : blk,
              ),
            },
          })),
        })),

      deleteBlock: (bookId, blockId) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({
            ...b,
            manuscript: { blocks: b.manuscript.blocks.filter((blk) => blk.id !== blockId) },
          })),
        })),

      clearManuscript: (bookId) =>
        set((s) => ({
          books: patchBook(s.books, bookId, (b) => ({ ...b, manuscript: emptyManuscript() })),
        })),

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
        activeTab: s.activeTab,
        dictationDrafts: s.dictationDrafts,
        manuscriptPlace: s.manuscriptPlace,
        lastSeenVersion: s.lastSeenVersion,
      }),
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        let books = (p.books ?? []).map((b) => ({
          ...b,
          tenseId: b.tenseId ?? DEFAULT_TENSE,
          perspectiveId: b.perspectiveId ?? DEFAULT_PERSPECTIVE,
        }));
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
          dictateSplit:
            typeof p.dictateSplit === 'number' && p.dictateSplit > 0.2 && p.dictateSplit < 0.8
              ? p.dictateSplit
              : current.dictateSplit,
          activeTab: isAppTab(p.activeTab) ? p.activeTab : current.activeTab,
          dictationDrafts: normalizeDictationDrafts(p.dictationDrafts),
          manuscriptPlace: normalizeManuscriptPlace(p.manuscriptPlace),
          // Persist is source of truth. Defaulting to current.lastSeenVersion or the
          // running app version would hide upgrades from installs that never wrote it.
          lastSeenVersion: normalizeLastSeenVersion(p.lastSeenVersion),
          books: (p.books ?? current.books).map((b) => ({
            ...b,
            tenseId: b.tenseId ?? DEFAULT_TENSE,
            perspectiveId: b.perspectiveId ?? DEFAULT_PERSPECTIVE,
          })),
          series: p.series ?? current.series,
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
