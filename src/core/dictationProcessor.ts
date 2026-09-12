import type { AdaptiveModelState, GenreProfile, NameEntry, PerspectiveId, TenseId } from './types';
import { parseAudioCues, type Segment } from './audioCues';
import { correctNames, type AppliedCorrection } from './nameLibrary';
import { extractNewCharacterCues, type SpokenCharacter } from './newCharacterCue';
import { applyPunctuation } from './punctuation';
import { recordCorrection, recordProse, vocabularyBoost } from './adaptiveModel';
import { applyLearnedCorrections } from './transcriptEdits';
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
  /**
   * Promote from the transcription box after the writer edited it.
   * Keeps their wording, deletions, and quote fixes. Still parses cues,
   * leftover spoken punctuation, names, and taught corrections.
   */
  preserveProse?: boolean;
}

export interface ProcessResult {
  segments: Segment[];
  corrections: AppliedCorrection[];
  adaptive: AdaptiveModelState;
  newCharacters: SpokenCharacter[];
}

/**
 * Turn a raw dictation transcript into structured, corrected segments:
 *   1. Fix trained proper-noun spellings via the name library.
 *   2. Apply spoken punctuation commands + genre typographic conventions.
 *   3. Structure prose: assumed dialogue quotes, tag commas, light punctuation.
 *   4. Align conservative narration (dialogue tags) to the book tense.
 *   5. Align first-person tags after quotes; leave third/second prose alone.
 *   6. New paragraph when the speaker changes; narration stays with tagged dialogue.
 *   7. Split out spoken structural cues (chapter/scene/section/paragraph).
 *   8. Update the on-device adaptive model.
 */
function characterNamesOf(entries: NameEntry[]): string[] {
  return entries.filter((e) => e.category === 'character').map((e) => e.canonical);
}

function runProsePipeline(
  transcript: string,
  options: Pick<ProcessOptions, 'entries' | 'genre' | 'tense' | 'perspective' | 'preserveProse'> & {
    adaptive?: AdaptiveModelState;
  },
): { text: string; corrections: AppliedCorrection[] } {
  const tense = options.tense ?? DEFAULT_TENSE;
  const perspective = options.perspective ?? DEFAULT_PERSPECTIVE;
  const boost = options.adaptive ? vocabularyBoost(options.adaptive) : undefined;
  const taught = options.adaptive ? applyLearnedCorrections(transcript, options.adaptive) : transcript;
  const named = correctNames(taught, options.entries, { vocabularyBoost: boost });
  const punctuated = applyPunctuation(named.text, options.genre);
  if (options.preserveProse) {
    return { text: punctuated, corrections: named.applied };
  }
  const structured = applyProseStructure(punctuated, options.genre, {
    characterNames: characterNamesOf(options.entries),
    perspective,
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
): { text: string; newCharacters: SpokenCharacter[] } {
  const pulled = extractNewCharacterCues(transcript);
  const { text } = runProsePipeline(pulled.remainder, options);
  const paragraphed = splitSpeakerParagraphs(text);
  return {
    text: paragraphed.replace(new RegExp(`\\s*${PARA_MARK}\\s*`, 'g'), '\n\n').trim(),
    newCharacters: pulled.characters,
  };
}

export function processTranscript(transcript: string, options: ProcessOptions): ProcessResult {
  const { adaptive } = options;
  const learn = options.learn ?? true;
  const pulled = extractNewCharacterCues(transcript, { keepNewlines: options.preserveProse });
  const normalized = options.preserveProse
    ? pulled.remainder.replace(/\n+/g, ` ${PARA_MARK} `).replace(/[ \t]+/g, ' ')
    : pulled.remainder.replace(/\n{2,}/g, ` ${PARA_MARK} `).replace(/\n/g, ' ');
  const { text: voiced, corrections } = runProsePipeline(normalized, options);
  const paragraphed = options.preserveProse ? voiced : splitSpeakerParagraphs(voiced);
  const segments = explodeParagraphMarks(parseAudioCues(paragraphed));

  let nextAdaptive = adaptive;
  if (learn) {
    for (const seg of segments) {
      if (seg.type === 'text') nextAdaptive = recordProse(nextAdaptive, seg.text);
    }
    for (const c of corrections) {
      nextAdaptive = recordCorrection(nextAdaptive, c.from, c.to);
    }
    for (const ch of pulled.characters) {
      nextAdaptive = recordProse(nextAdaptive, ch.canonical);
      for (const alias of ch.aliases) {
        if (alias.toLowerCase() !== ch.canonical.toLowerCase()) {
          nextAdaptive = recordCorrection(nextAdaptive, alias, ch.canonical);
        }
      }
    }
  }

  return { segments, corrections, adaptive: nextAdaptive, newCharacters: pulled.characters };
}

/** Process without mutating the adaptive model — handy for live previews. */
export function previewTranscript(
  transcript: string,
  options: Omit<ProcessOptions, 'learn'>,
): ProcessResult {
  return processTranscript(transcript, { ...options, learn: false });
}
