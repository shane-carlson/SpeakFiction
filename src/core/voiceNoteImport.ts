import { containsStructureCue } from './audioCues';
import {
  caretAfterJoin,
  joinDraftAt,
  type DictationDraft,
} from './dictationDraft';
import { cleanupDictationText } from './dictationProcessor';
import { getGenre } from './genres';
import type { SpokenCharacter } from './newCharacterCue';
import { mergeSeriesNameLibrary } from './seriesNames';
import type { Book } from './types';

export interface VoiceNoteImportContext {
  book: Book;
  books: Book[];
}

export interface VoiceNoteImportResult {
  draft: DictationDraft;
  caret: number;
  cleaned: string;
  newCharacters: SpokenCharacter[];
  captureCommand: boolean;
}

/**
 * Same path as the mic: names, cues, and genre punctuation land in the
 * transcription box. Never writes the manuscript.
 */
export function importTextToTranscriptionBox(
  text: string,
  prev: DictationDraft,
  ctx: VoiceNoteImportContext,
  caret?: number | null,
): VoiceNoteImportResult {
  const { text: cleaned, newCharacters } = cleanupDictationText(text, {
    entries: mergeSeriesNameLibrary(ctx.books, ctx.book),
    genre: getGenre(ctx.book.genreId),
    tense: ctx.book.tenseId,
    perspective: ctx.book.perspectiveId,
    adaptive: ctx.book.adaptive,
  });
  const captureCommand = newCharacters.length > 0 || containsStructureCue(cleaned);
  if (!cleaned) {
    return { draft: prev, caret: caret ?? 0, cleaned, newCharacters, captureCommand };
  }
  const next = joinDraftAt(prev, cleaned, caret);
  return {
    draft: next,
    caret: caretAfterJoin(prev, next, caret),
    cleaned,
    newCharacters,
    captureCommand,
  };
}
