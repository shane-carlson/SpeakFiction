/**
 * Core domain types for SpeakFiction.
 *
 * These types are intentionally framework-agnostic so the dictation/processing
 * "brains" can be unit-tested and reused across the Electron main process, the
 * React renderer, and (eventually) a native macOS host.
 */

export type NameCategory = 'character' | 'location' | 'item' | 'organization' | 'other';

/** A single trained proper-noun entry in a book/series name library. */
export interface NameEntry {
  id: string;
  /** The canonical spelling that should appear in the manuscript. */
  canonical: string;
  category: NameCategory;
  /**
   * Alternate spoken/written forms that should be normalized to `canonical`.
   * e.g. canonical "Kaeldros" with aliases ["kaldros", "kel dros"].
   */
  aliases: string[];
  /** Optional note shown in the library UI (e.g. "villain, book 2"). */
  note?: string;
}

export type GenreId =
  | 'literary'
  | 'fantasy'
  | 'sci-fi'
  | 'thriller'
  | 'mystery'
  | 'romance'
  | 'horror'
  | 'ya'
  | 'generic';

export type QuoteStyle = 'curly' | 'straight';
export type DashStyle = 'em' | 'en' | 'hyphen';

/** Punctuation & structure conventions applied per genre. */
export interface GenreProfile {
  id: GenreId;
  name: string;
  description: string;
  /** Curly “smart” quotes vs straight quotes for dialogue. */
  quoteStyle: QuoteStyle;
  /** How the spoken word "dash" is rendered. */
  dashStyle: DashStyle;
  /** Insert the serial (Oxford) comma. */
  oxfordComma: boolean;
  /** Convert three dots / spoken "ellipsis" to a single … glyph. */
  useEllipsisGlyph: boolean;
  /** Common section-break glyph used when exporting scene breaks. */
  sceneBreakGlyph: string;
}

export type BlockType = 'chapter' | 'scene' | 'section' | 'paragraph';

/** One node in the linear manuscript model. */
export interface Block {
  id: string;
  type: BlockType;
  /** Title for structural blocks (chapter/scene/section). */
  title?: string;
  /** Prose for paragraph blocks. */
  text?: string;
}

export interface Manuscript {
  blocks: Block[];
}

/** Serializable state for the adaptive on-device model. */
export interface AdaptiveModelState {
  /** spokenForm -> { canonical -> count } chosen by the user. */
  corrections: Record<string, Record<string, number>>;
  /** Frequency of accepted words, used to bias fuzzy matching. */
  vocabulary: Record<string, number>;
  /** Total prose words processed, for surfacing learning progress. */
  wordsSeen: number;
}

export interface Book {
  id: string;
  title: string;
  seriesId?: string;
  genreId: GenreId;
  nameLibrary: NameEntry[];
  manuscript: Manuscript;
  adaptive: AdaptiveModelState;
  createdAt: number;
  updatedAt: number;
}

export interface Series {
  id: string;
  name: string;
}

export type IntegrationTarget = 'scrivener' | 'word' | 'googledocs' | 'markdown' | 'plaintext';
