import type { AdaptiveModelState, GenreProfile, NameEntry, PerspectiveId, TenseId } from './types';
import { parseAudioCues, type Segment } from './audioCues';
import { correctNames, type AppliedCorrection } from './nameLibrary';
import { applyPunctuation } from './punctuation';
import { recordCorrection, recordProse, vocabularyBoost } from './adaptiveModel';
import { applyTenseCleanup, DEFAULT_TENSE } from './tense';
import { applyPerspectiveCleanup, DEFAULT_PERSPECTIVE } from './perspective';
import {
  applyProseStructure,
  explodeParagraphMarks,
  PARA_MARK,
  splitSpeakerParagraphs,
} from './proseStructure';

export interface ProcessOptions {
  entries: NameEntry[];
  genre: GenreProfile;
  adaptive: AdaptiveModelState;
  /** Book narrative tense. Dialogue is not rewritten. */
  tense?: TenseId;
  /** Book narrative perspective. Dialogue is not rewritten. */
  perspective?: PerspectiveId;
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
 *   1. Fix trained proper-noun spellings via the name library.
 *   2. Apply spoken punctuation commands + genre typographic conventions.
 *   3. Structure prose: assumed dialogue quotes, tag commas, light punctuation.
 *   4. Align conservative narration (dialogue tags) to the book tense.
 *   5. Align first-person tags after quotes; leave third/second prose alone.
 *   6. Split speakers / narration vs dialogue into paragraph marks.
 *   7. Split out spoken structural cues (chapter/scene/section/paragraph).
 *   8. Update the on-device adaptive model.
 */
function characterNamesOf(entries: NameEntry[]): string[] {
  return entries.filter((e) => e.category === 'character').map((e) => e.canonical);
}

function runProsePipeline(
  transcript: string,
  options: Pick<ProcessOptions, 'entries' | 'genre' | 'tense' | 'perspective'> & {
    adaptive?: AdaptiveModelState;
  },
): { text: string; corrections: AppliedCorrection[] } {
  const tense = options.tense ?? DEFAULT_TENSE;
  const perspective = options.perspective ?? DEFAULT_PERSPECTIVE;
  const boost = options.adaptive ? vocabularyBoost(options.adaptive) : undefined;
  const named = correctNames(transcript, options.entries, { vocabularyBoost: boost });
  const punctuated = applyPunctuation(named.text, options.genre);
  const structured = applyProseStructure(punctuated, options.genre, {
    characterNames: characterNamesOf(options.entries),
  });
  const tensed = applyTenseCleanup(structured, tense);
  const voiced = applyPerspectiveCleanup(tensed, perspective);
  return { text: voiced, corrections: named.applied };
}

/**
 * Cleanup for the Dictate transcript box: names, punctuation, assumed quotes,
 * tense/perspective. Spoken structure cues stay as words so insert can parse them.
 */
export function cleanupDictationText(
  transcript: string,
  options: Omit<ProcessOptions, 'adaptive' | 'learn'> & { adaptive?: AdaptiveModelState },
): string {
  const { text } = runProsePipeline(transcript, options);
  const paragraphed = splitSpeakerParagraphs(text);
  return paragraphed.replace(new RegExp(`\\s*${PARA_MARK}\\s*`, 'g'), '\n\n').trim();
}

export function processTranscript(transcript: string, options: ProcessOptions): ProcessResult {
  const { adaptive } = options;
  const learn = options.learn ?? true;
  const normalized = transcript.replace(/\n+/g, ` ${PARA_MARK} `);
  const { text: voiced, corrections } = runProsePipeline(normalized, options);
  const paragraphed = splitSpeakerParagraphs(voiced);
  const segments = explodeParagraphMarks(parseAudioCues(paragraphed));

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
