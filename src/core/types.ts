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
  | 'litrpg'
  | 'sci-fi'
  | 'thriller'
  | 'mystery'
  | 'romance'
  | 'romantasy'
  | 'queer-lit'
  | 'horror'
  | 'ya'
  | 'generic';

/** Narrative tense for the book. Dialogue keeps the character’s own tense. */
export type TenseId = 'past' | 'present' | 'future' | 'past-perfect';

export interface TenseProfile {
  id: TenseId;
  name: string;
  description: string;
  /** How narration vs dialogue should be treated. */
  narrativeHint: string;
}

/** Who tells the story. Quoted dialogue keeps the character’s pronouns. */
export type PerspectiveId = 'first' | 'second' | 'third-limited' | 'third-omniscient';

export interface PerspectiveProfile {
  id: PerspectiveId;
  name: string;
  description: string;
  narrativeHint: string;
}

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

export type BlockType = 'chapter' | 'scene' | 'section' | 'paragraph' | 'image' | 'table';

/** Inline formatting on a paragraph. Offsets are into `text` (plain string). */
export type InlineMarkKind = 'bold' | 'italic' | 'underline' | 'strike';

export interface InlineMark {
  kind: InlineMarkKind;
  /** Inclusive start index in `text`. */
  start: number;
  /** Exclusive end index in `text`. */
  end: number;
}

export type ManuscriptImageMime = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

/** Reference to a picture stored beside the library session (not in git). */
export interface ManuscriptImage {
  mediaId: string;
  mime: ManuscriptImageMime;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
}

/** One cell in a manuscript table. Plain text; marks are optional. */
export interface TableCell {
  text: string;
  marks?: InlineMark[];
}

/** First-class table: a rectangular grid of cells. */
export interface ManuscriptTable {
  rows: TableCell[][];
}

/** One node in the linear manuscript model. */
export interface Block {
  id: string;
  type: BlockType;
  /** Title for structural blocks (chapter/scene/section). */
  title?: string;
  /** Prose for paragraph blocks. Always a plain string; marks are separate. */
  text?: string;
  /** Optional inline marks. Missing/empty means plain (legacy manuscripts). */
  marks?: InlineMark[];
  /** Present when `type` is `image`. */
  image?: ManuscriptImage;
  /** Present when `type` is `table`. */
  table?: ManuscriptTable;
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
  /** Position in that series (1, 2, 1.5). Omitted for standalones. */
  seriesBookNumber?: number;
  genreId: GenreId;
  /** Narrative tense. Defaults to past for fiction. */
  tenseId: TenseId;
  /** Narrative perspective. Defaults to third-limited. */
  perspectiveId: PerspectiveId;
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
