import { recordCorrection, suggestCanonical } from './adaptiveModel';
import { normalizeToken } from './phonetics';
import type { AdaptiveModelState, NameCategory } from './types';

/** Articles: do not apply a learned name over “the same night”. */
const ARTICLES = new Set(['a', 'an', 'the']);

/**
 * Common words we never store as a name alias. “same” → Shane still lives in
 * the adaptive layer so future speech can be corrected without rewriting every
 * ordinary “same”.
 */
const CLOSED_CLASS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'can',
  'could',
  'did',
  'do',
  'for',
  'from',
  'had',
  'has',
  'have',
  'he',
  'her',
  'here',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'just',
  'like',
  'me',
  'my',
  'no',
  'not',
  'of',
  'on',
  'or',
  'said',
  'same',
  'say',
  'she',
  'so',
  'some',
  'than',
  'that',
  'the',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'to',
  'was',
  'we',
  'were',
  'what',
  'when',
  'who',
  'why',
  'will',
  'with',
  'would',
  'yes',
  'you',
  'your',
]);

export interface WordCorrection {
  from: string;
  to: string;
}

export interface LearnedName {
  canonical: string;
  aliases: string[];
  category: NameCategory;
}

interface WordTok {
  norm: string;
  surface: string;
}

function tokenizeWords(text: string): WordTok[] {
  const out: WordTok[] = [];
  for (const raw of (text ?? '').split(/\s+/)) {
    const norm = normalizeToken(raw);
    if (!norm) continue;
    out.push({ norm, surface: raw.replace(/^[^A-Za-z0-9'’]+|[^A-Za-z0-9'’]+$/g, '') || raw });
  }
  return out;
}

/** LCS backtrack of word tokens. */
/**
 * Word substitutions the writer made in the transcription box.
 * Insertions and deletions are ignored (those already change the insert payload).
 * Wholesale replaces (load sample) return nothing.
 */
export function wordCorrectionsFromEdit(before: string, after: string): WordCorrection[] {
  const a = tokenizeWords(before);
  const b = tokenizeWords(after);
  if (!a.length || !b.length) return [];
  if (Math.abs(a.length - b.length) > 40) return [];

  let i = 0;
  while (i < a.length && i < b.length && a[i].norm === b[i].norm) i++;
  let ai = a.length - 1;
  let bi = b.length - 1;
  while (ai >= i && bi >= i && a[ai].norm === b[bi].norm) {
    ai--;
    bi--;
  }
  const left = a.slice(i, ai + 1);
  const right = b.slice(i, bi + 1);
  if (!left.length || !right.length) return [];
  if (left.length !== right.length) return [];
  const pairs: WordCorrection[] = [];
  for (let k = 0; k < left.length; k++) {
    if (left[k].norm === right[k].norm) continue;
    pairs.push({ from: left[k].norm, to: right[k].surface });
  }
  if (pairs.length > 16) return [];
  if (left.length >= 4 && pairs.length >= left.length * 0.6) return [];
  return pairs;
}

export function looksLikeProperName(word: string): boolean {
  const surface = (word ?? '').replace(/^[^A-Za-z]+|[^A-Za-z'’-]+$/g, '');
  if (surface.length < 2) return false;
  if (CLOSED_CLASS.has(surface.toLowerCase())) return false;
  return /^[A-Z][A-Za-z'’\-]*[A-Za-z]$/.test(surface) || /^[A-Z][A-Za-z'’\-]+$/.test(surface);
}

export function isClosedClassWord(word: string): boolean {
  return CLOSED_CLASS.has(normalizeToken(word));
}

/** Names to add to the library from box substitutions. Closed-class mishears are not aliases. */
export function namesFromCorrections(pairs: WordCorrection[]): LearnedName[] {
  const out: LearnedName[] = [];
  const seen = new Set<string>();
  for (const pair of pairs) {
    if (!looksLikeProperName(pair.to)) continue;
    const key = pair.to.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const aliases = isClosedClassWord(pair.from) ? [] : [pair.from];
    out.push({ canonical: pair.to, aliases, category: 'character' });
  }
  return out;
}

function reattach(original: string, replacement: string): string {
  const leading = original.match(/^[^a-z0-9]+/i)?.[0] ?? '';
  const trailing = original.match(/[^a-z0-9]+$/i)?.[0] ?? '';
  return leading + replacement + trailing;
}

/**
 * Apply writer-taught spoken → canonical pairs. Skip a hit after an article so
 * “the same night” stays, while a taught “same” → Shane still fixes “same waited”.
 */
export function applyLearnedCorrections(text: string, state: AdaptiveModelState): string {
  if (!text || !state?.corrections || !Object.keys(state.corrections).length) return text;
  const parts = text.split(/(\s+)/);
  let prev = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.trim()) continue;
    const norm = normalizeToken(part);
    if (!norm) {
      prev = '';
      continue;
    }
    const suggested = suggestCanonical(state, norm);
    if (suggested && suggested.toLowerCase() !== norm && !ARTICLES.has(prev)) {
      parts[i] = reattach(part, suggested);
    }
    prev = norm;
  }
  return parts.join('');
}

export function recordEditCorrections(
  state: AdaptiveModelState,
  pairs: WordCorrection[],
): AdaptiveModelState {
  let next = state;
  for (const pair of pairs) {
    next = recordCorrection(next, pair.from, pair.to);
  }
  return next;
}
