import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Book,
  GenreId,
  NameCategory,
  NameEntry,
  Series,
} from './core/types';
import { emptyAdaptiveState } from './core/adaptiveModel';
import { emptyManuscript, appendSegments, trimEmptyBlocks } from './core/manuscript';
import { processTranscript } from './core/dictationProcessor';
import { getGenre } from './core/genres';
import { uid } from './core/util';
import type { AppliedCorrection } from './core/nameLibrary';

export interface DictationOutcome {
  corrections: AppliedCorrection[];
  structureAdded: number;
  wordsAdded: number;
}

interface AppState {
  series: Series[];
  books: Book[];
  activeBookId: string | null;

  createSeries: (name: string) => string;
  createBook: (title: string, genreId: GenreId, seriesId?: string) => string;
  deleteBook: (id: string) => void;
  setActiveBook: (id: string) => void;
  setGenre: (bookId: string, genreId: GenreId) => void;
  renameBook: (bookId: string, title: string) => void;

  addNameEntry: (bookId: string, entry: Omit<NameEntry, 'id'>) => void;
  updateNameEntry: (bookId: string, entry: NameEntry) => void;
  removeNameEntry: (bookId: string, entryId: string) => void;

  applyDictation: (bookId: string, transcript: string) => DictationOutcome;
  updateBlockText: (bookId: string, blockId: string, text: string) => void;
  deleteBlock: (bookId: string, blockId: string) => void;
  clearManuscript: (bookId: string) => void;
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
    title: 'The Ember King',
    seriesId,
    genreId: 'fantasy',
    nameLibrary,
    manuscript: {
      blocks: appendSegments(emptyManuscript().blocks, [
        { type: 'structure', event: { kind: 'chapter', title: 'The Exile Returns' } },
        {
          type: 'text',
          text: 'Kaeldros crested the ridge as the last light bled from the sky, Vaelthorn Keep a black tooth against the clouds.',
        },
      ]),
    },
    adaptive: emptyAdaptiveState(),
    createdAt: now,
    updatedAt: now,
  };

  return { series: [{ id: seriesId, name: 'The Ember Cycle' }], book };
}

function patchBook(books: Book[], id: string, fn: (b: Book) => Book): Book[] {
  return books.map((b) => (b.id === id ? { ...fn(b), updatedAt: Date.now() } : b));
}

const seed = seedBook();

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      series: seed.series,
      books: [seed.book],
      activeBookId: seed.book.id,

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
          return { books, activeBookId: s.activeBookId === id ? books[0]?.id ?? null : s.activeBookId };
        }),

      setActiveBook: (id) => set({ activeBookId: id }),

      setGenre: (bookId, genreId) =>
        set((s) => ({ books: patchBook(s.books, bookId, (b) => ({ ...b, genreId })) })),

      renameBook: (bookId, title) =>
        set((s) => ({ books: patchBook(s.books, bookId, (b) => ({ ...b, title })) })),

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

      applyDictation: (bookId, transcript) => {
        const book = get().books.find((b) => b.id === bookId);
        if (!book) return { corrections: [], structureAdded: 0, wordsAdded: 0 };

        const result = processTranscript(transcript, {
          entries: book.nameLibrary,
          genre: getGenre(book.genreId),
          adaptive: book.adaptive,
        });

        const newBlocks = trimEmptyBlocks(appendSegments(book.manuscript.blocks, result.segments));
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
    }),
    { name: 'speakfiction-state-v1', version: 1 },
  ),
);

export const CATEGORY_LABELS: Record<NameCategory, string> = {
  character: 'Character',
  location: 'Location',
  item: 'Item',
  organization: 'Organization',
  other: 'Other',
};
