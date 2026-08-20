import { formatCueTitle } from './audioCues';
import { similarity } from './phonetics';

export interface SpokenCharacter {
  canonical: string;
  aliases: string[];
}

export interface NewCharacterExtract {
  remainder: string;
  characters: SpokenCharacter[];
}

const CUE = /\bnew\s+chara[a-z]{0,8}ters?\b/gi;

const NAME_WORD = /[A-Za-z][A-Za-z''-]*/g;

function nameWords(s: string): Array<{ word: string; start: number; end: number }> {
  const out: Array<{ word: string; start: number; end: number }> = [];
  const re = new RegExp(NAME_WORD.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    out.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function namesMatch(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left === right) return true;
  return similarity(left, right) >= 0.75;
}

function uniqueAliases(canonical: string, spoken: string[]): string[] {
  const key = canonical.toLowerCase();
  const seen = new Set<string>([key]);
  const aliases: string[] = [];
  for (const raw of spoken) {
    const form = raw.trim();
    if (!form) continue;
    const lower = form.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    aliases.push(form);
  }
  return aliases;
}

/** After “new character”, the name must be spoken twice. */
export function takeRepeatedName(rest: string): { first: string; second: string; consumed: number } | null {
  const words = nameWords(rest);
  const max = Math.min(4, Math.floor(words.length / 2));
  for (let n = max; n >= 1; n--) {
    const a = words.slice(0, n);
    const b = words.slice(n, n * 2);
    if (b.length < n) continue;
    const first = a.map((w) => w.word).join(' ');
    const second = b.map((w) => w.word).join(' ');
    if (!namesMatch(first, second)) continue;
    let consumed = b[n - 1].end;
    const extra = rest.slice(consumed).match(/^[.!?,\s]*/);
    if (extra) consumed += extra[0].length;
    return { first, second, consumed };
  }
  return null;
}

function spokenCharacter(first: string, second: string): SpokenCharacter {
  const canonical = formatCueTitle(first);
  return {
    canonical,
    aliases: uniqueAliases(canonical, [first, second]),
  };
}

/**
 * Pull “New Character” cues out of a transcript.
 * After the cue, the name is spoken twice (any name, e.g. Andreos Andreos).
 * The cue and the repeated name never remain as prose.
 */
export function extractNewCharacterCues(transcript: string): NewCharacterExtract {
  const characters: SpokenCharacter[] = [];
  let remainder = '';
  let last = 0;
  CUE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CUE.exec(transcript)) !== null) {
    remainder += transcript.slice(last, match.index);
    const afterCue = transcript.slice(match.index + match[0].length);
    const taken = takeRepeatedName(afterCue);
    if (!taken) {
      // Incomplete cue — keep the words as prose so “new characters” in a sentence survives.
      remainder += transcript.slice(match.index, match.index + match[0].length);
      last = match.index + match[0].length;
      CUE.lastIndex = last;
      continue;
    }
    characters.push(spokenCharacter(taken.first, taken.second));
    last = match.index + match[0].length + taken.consumed;
    CUE.lastIndex = last;
  }
  remainder += transcript.slice(last);
  return {
    remainder: remainder.replace(/\s+/g, ' ').replace(/^[\s.,;:!?]+/, '').trim(),
    characters,
  };
}

export function containsNewCharacterCue(text: string): boolean {
  CUE.lastIndex = 0;
  return CUE.test(text);
}
