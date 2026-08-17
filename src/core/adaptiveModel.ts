import type { AdaptiveModelState } from './types';
import { normalizeToken } from './phonetics';

/**
 * A lightweight, fully on-device adaptive model.
 *
 * It learns two things from the writer without any network calls or
 * externally-trained weights:
 *   1. Correction habits: which canonical form the writer picks for a given
 *      misheard/spoken form.
 *   2. Personal vocabulary frequency: which words the writer actually uses,
 *      used to bias name-library fuzzy matching toward familiar terms.
 *
 * This is intentionally a transparent, inspectable model. It defines the
 * interface (`vocabularyBoost`, `suggestCanonical`, `recordProse`) that a
 * future Creative-Commons-trained local LLM (e.g. via llama.cpp) can implement
 * as a drop-in replacement.
 */

export function emptyAdaptiveState(): AdaptiveModelState {
  return { corrections: {}, vocabulary: {}, wordsSeen: 0 };
}

export function recordProse(state: AdaptiveModelState, text: string): AdaptiveModelState {
  const vocabulary = { ...state.vocabulary };
  let wordsSeen = state.wordsSeen;
  for (const raw of text.split(/\s+/)) {
    const w = normalizeToken(raw);
    if (!w) continue;
    vocabulary[w] = (vocabulary[w] ?? 0) + 1;
    wordsSeen++;
  }
  return { ...state, vocabulary, wordsSeen };
}

export function recordCorrection(
  state: AdaptiveModelState,
  spokenForm: string,
  canonical: string,
): AdaptiveModelState {
  const key = normalizeToken(spokenForm) || spokenForm.toLowerCase();
  const corrections = { ...state.corrections };
  const bucket = { ...(corrections[key] ?? {}) };
  bucket[canonical] = (bucket[canonical] ?? 0) + 1;
  corrections[key] = bucket;
  return { ...state, corrections };
}

/** The canonical form the writer most often chooses for a spoken form. */
export function suggestCanonical(state: AdaptiveModelState, spokenForm: string): string | null {
  const key = normalizeToken(spokenForm) || spokenForm.toLowerCase();
  const bucket = state.corrections[key];
  if (!bucket) return null;
  let best: string | null = null;
  let bestCount = 0;
  for (const [canonical, count] of Object.entries(bucket)) {
    if (count > bestCount) {
      best = canonical;
      bestCount = count;
    }
  }
  return best;
}

/** Frequency map (lowercased canonical -> count) for fuzzy-match biasing. */
export function vocabularyBoost(state: AdaptiveModelState): Record<string, number> {
  return state.vocabulary;
}

export interface LearningProgress {
  wordsSeen: number;
  uniqueWords: number;
  learnedCorrections: number;
}

export function learningProgress(state: AdaptiveModelState): LearningProgress {
  return {
    wordsSeen: state.wordsSeen,
    uniqueWords: Object.keys(state.vocabulary).length,
    learnedCorrections: Object.keys(state.corrections).length,
  };
}
