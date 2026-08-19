import { containsStructureCue } from './audioCues';

const FILLER =
  /^(thanks for watching\.?|thank you\.?|thanks\.?|thank you for watching\.?|you|yeah\.?|yep\.?|yes\.?|no\.?|bye\.?|okay\.?|ok\.?|hmm\.?|uh\.?|um\.?|ah\.?|oh\.?|the|a|and|\.|\,)$/i;

/** Whisper silence tokens that loop during extended quiet. */
const HALLUCINATION_WORDS = new Set([
  'no',
  'yeah',
  'yep',
  'yes',
  'you',
  'the',
  'a',
  'and',
  'okay',
  'ok',
  'hmm',
  'uh',
  'um',
  'ah',
  'oh',
  'bye',
  'thanks',
  'thank',
  'watching',
  'for',
]);

const SUBTITLE_PHRASE =
  /^(thanks for watching|thank you for watching|thanks for watching everybody|thank you)[.!?]*$/i;

/** Whisper often loops one filler word, then glues the next real sentence onto it. */
const IDENTICAL_LEADING_FILLER =
  /^((?:no|yeah|yep|yes|okay|ok|hmm|uh|um|ah|oh)(?:[.,!?])?)(?:\s+\1(?:[.,!?])?)+(\s+|$)/i;

function tokensOf(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function norm(token: string): string {
  return token.toLowerCase().replace(/^[^\w']+|[^\w']+$/g, '');
}

/** Keep at most two consecutive copies of the same word. */
export function collapseRepeats(text: string): string {
  const tokens = tokensOf(text);
  const out: string[] = [];
  let prev = '';
  let run = 0;
  for (const token of tokens) {
    const key = norm(token);
    if (key && key === prev) {
      run += 1;
      if (run < 2) out.push(token);
    } else {
      prev = key;
      run = 0;
      out.push(token);
    }
  }
  return out.join(' ');
}

/** True when one word makes up most of the transcript (Whisper silence loops). */
export function isMostlyOneToken(text: string): boolean {
  const tokens = tokensOf(text).map(norm).filter(Boolean);
  if (tokens.length < 4) return false;
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  const max = Math.max(...counts.values());
  return max / tokens.length >= 0.55;
}

/**
 * Strip a leading run of the same Whisper filler token when a real sentence follows.
 * Does not nibble short phrases or mixed prose like “No, she said no.”
 */
export function stripLeadingSilenceFiller(text: string): string {
  const trimmed = text.trim();
  const match = IDENTICAL_LEADING_FILLER.exec(trimmed);
  if (!match) return trimmed;
  const rest = trimmed.slice(match[0].length).trim();
  if (tokensOf(rest).length < 3) return trimmed;
  return rest;
}

/**
 * Whole-utterance silence garbage: repeated short tokens or known filler loops.
 * Mixed prose that happens to contain "no" once is not a loop.
 * Spoken structure cues are never treated as filler.
 */
export function isSilenceLoop(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (containsStructureCue(trimmed)) return false;
  if (FILLER.test(trimmed) || SUBTITLE_PHRASE.test(trimmed)) return true;
  const tokens = tokensOf(trimmed).map(norm).filter(Boolean);
  if (tokens.length === 0) return false;
  if (tokens.every((t) => t === tokens[0]) && HALLUCINATION_WORDS.has(tokens[0])) return true;
  if (isMostlyOneToken(trimmed)) {
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    let top = '';
    let topCount = 0;
    for (const [token, count] of counts) {
      if (count > topCount) {
        top = token;
        topCount = count;
      }
    }
    if (HALLUCINATION_WORDS.has(top) || /^\d+$/.test(top)) return true;
  }
  return false;
}

export function cleanTranscript(text: string): string {
  const stripped = stripLeadingSilenceFiller(text);
  if (!stripped || isSilenceLoop(stripped)) return '';
  const collapsed = collapseRepeats(stripped);
  if (!collapsed || isSilenceLoop(collapsed)) return '';
  return collapsed;
}
