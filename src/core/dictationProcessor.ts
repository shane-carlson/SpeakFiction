import type { AdaptiveModelState, GenreProfile, NameEntry } from './types';
import { parseAudioCues, type Segment } from './audioCues';
import { correctNames, type AppliedCorrection } from './nameLibrary';
import { applyPunctuation } from './punctuation';
import { recordCorrection, recordProse, vocabularyBoost } from './adaptiveModel';

export interface ProcessOptions {
  entries: NameEntry[];
  genre: GenreProfile;
  adaptive: AdaptiveModelState;
  /** When false, the adaptive model is not updated (e.g. previews). */
  learn?: boolean;
}

export interface ProcessResult {
  segments: Segment[];
  corrections: AppliedCorrection[];
  adaptive: AdaptiveModelState;
}

/**
 * Turn a raw dictation transcript into structured, corrected segments:
 *   1. Split out spoken structural cues (chapter/scene/section/paragraph).
 *   2. Fix trained proper-noun spellings via the name library.
 *   3. Apply spoken punctuation commands + genre typographic conventions.
 *   4. Update the on-device adaptive model.
 */
export function processTranscript(transcript: string, options: ProcessOptions): ProcessResult {
  const { entries, genre, adaptive } = options;
  const learn = options.learn ?? true;
  const boost = vocabularyBoost(adaptive);

  // 1. Fix trained proper-noun spellings while multi-word names are still intact.
  const named = correctNames(transcript, entries, { vocabularyBoost: boost });
  // 2. Convert spoken punctuation + apply genre typography. This also produces
  //    the real sentence terminators the cue parser needs to bound titles.
  const punctuated = applyPunctuation(named.text, genre);
  // 3. Split into prose + structural segments.
  const segments: Segment[] = parseAudioCues(punctuated);

  const corrections: AppliedCorrection[] = named.applied;
  let nextAdaptive = adaptive;
  if (learn) {
    for (const seg of segments) {
      if (seg.type === 'text') nextAdaptive = recordProse(nextAdaptive, seg.text);
    }
    for (const c of corrections) {
      nextAdaptive = recordCorrection(nextAdaptive, c.from, c.to);
    }
  }

  return { segments, corrections, adaptive: nextAdaptive };
}

/** Process without mutating the adaptive model — handy for live previews. */
export function previewTranscript(
  transcript: string,
  options: Omit<ProcessOptions, 'learn'>,
): ProcessResult {
  return processTranscript(transcript, { ...options, learn: false });
}
