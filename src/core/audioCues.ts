import type { BlockType } from './types';

/** A structural boundary the writer spoke aloud while dictating. */
export type StructuralKind = Extract<BlockType, 'chapter' | 'scene' | 'section' | 'paragraph'>;

export interface StructuralEvent {
  kind: StructuralKind;
  title?: string;
}

export type Segment =
  | { type: 'text'; text: string }
  | { type: 'structure'; event: StructuralEvent };

interface Phrase {
  phrase: string;
  kind: StructuralKind;
}

/**
 * Spoken cues that create structure. When importing to a writing tool these
 * become real chapter/scene/section boundaries. Ordered longest-first so more
 * specific phrases win.
 */
const PHRASES: Phrase[] = [
  { phrase: 'new chapter', kind: 'chapter' },
  { phrase: 'next chapter', kind: 'chapter' },
  { phrase: 'chapter break', kind: 'chapter' },
  { phrase: 'begin chapter', kind: 'chapter' },
  { phrase: 'new scene', kind: 'scene' },
  { phrase: 'scene break', kind: 'scene' },
  { phrase: 'next scene', kind: 'scene' },
  { phrase: 'new section', kind: 'section' },
  { phrase: 'section break', kind: 'section' },
  { phrase: 'new paragraph', kind: 'paragraph' },
  { phrase: 'paragraph break', kind: 'paragraph' },
  { phrase: 'new line', kind: 'paragraph' },
];

const KIND_BY_PHRASE = new Map<string, StructuralKind>(
  PHRASES.map((p) => [p.phrase, p.kind]),
);

const CMD_ALTERNATION = PHRASES.map((p) => p.phrase.replace(/ /g, '\\s+')).join('|');

const CUE_FINDER = new RegExp(`\\b(${CMD_ALTERNATION})\\b`, 'gi');

const TITLE_VERB = /^(?:titled|called|named|entitled)\s+/i;

/** Cues that take the following sentence as a title when no “titled X” was spoken. */
const IMPLICIT_TITLE_PHRASES = new Set([
  'new chapter',
  'next chapter',
  'begin chapter',
  'new scene',
  'next scene',
  'new section',
]);

const PARA_MARK = '\uE001';

const IMPLICIT_TITLE_MAX_WORDS = 10;

function cleanText(raw: string): string {
  return raw.replace(/^[\s.,;:!?]+/, '').replace(/\s+/g, ' ').trim();
}

function normalizePhrase(matched: string): string {
  return matched.toLowerCase().replace(/\s+/g, ' ').trim();
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Light title case when STT dumped the heading in lowercase. */
export function formatCueTitle(raw: string): string {
  const t = raw.trim().replace(/[,;:]+$/g, '');
  if (!t) return t;
  if (/[A-Z]/.test(t)) return t.charAt(0).toUpperCase() + t.slice(1);
  return t.replace(/(^|[\s-])([a-z])/g, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
}

function firstSentenceEnd(text: string): number {
  const cue = new RegExp(`\\b(?:${CMD_ALTERNATION})\\b`, 'i').exec(text);
  const punct = /[.!?]/.exec(text);
  const mark = text.indexOf(PARA_MARK);
  let end = text.length;
  if (cue && cue.index >= 0) end = Math.min(end, cue.index);
  if (punct) end = Math.min(end, punct.index);
  if (mark >= 0) end = Math.min(end, mark);
  return end;
}

/**
 * First sentence after a chapter/scene/section cue becomes the title.
 * “titled/called/named/entitled X” still wins and is not double-captured.
 */
export function takeFollowingTitle(
  rest: string,
  kind: StructuralKind,
  phrase: string,
): { title?: string; consumed: number } {
  if (kind === 'paragraph') return { consumed: 0 };

  const startWs = rest.match(/^\s*/)?.[0].length ?? 0;
  let i = startWs;
  const titled = TITLE_VERB.exec(rest.slice(i));
  const explicit = Boolean(titled);
  if (titled) i += titled[0].length;

  const remainder = rest.slice(i);
  if (!remainder.trim()) return { consumed: explicit ? i : 0 };

  const end = firstSentenceEnd(remainder);
  if (end === 0) return { consumed: explicit ? i : 0 };

  const rawTitle = remainder.slice(0, end).trim().replace(/[,;:]+$/g, '');
  if (!rawTitle) return { consumed: explicit ? i : 0 };

  const implicitOk = IMPLICIT_TITLE_PHRASES.has(normalizePhrase(phrase));
  if (!explicit && !implicitOk) return { consumed: 0 };
  if (
    !explicit &&
    (wordCount(rawTitle) > IMPLICIT_TITLE_MAX_WORDS ||
      /[\u201C"]/.test(rawTitle) ||
      /\b(said|says|asked|whispered|replied)\b/i.test(rawTitle))
  ) {
    return { consumed: 0 };
  }

  let consumed = i + end;
  const extra = rest.slice(consumed).match(/^[.!?,;:\s\uE001]+/);
  if (extra) consumed += extra[0].length;

  return { title: formatCueTitle(rawTitle), consumed };
}

/**
 * Split a raw transcript into ordered prose + structure segments.
 * Chapter/scene/section cues take the following sentence as a title unless
 * the next token is another cue (empty title).
 */
export function parseAudioCues(transcript: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  CUE_FINDER.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = CUE_FINDER.exec(transcript)) !== null) {
    const [full, phrase] = match;
    const start = match.index;

    const before = cleanText(transcript.slice(lastIndex, start));
    if (before) segments.push({ type: 'text', text: before });

    const kind = KIND_BY_PHRASE.get(normalizePhrase(phrase)) ?? 'section';
    const rest = transcript.slice(start + full.length);
    const taken = takeFollowingTitle(rest, kind, phrase);
    const event: StructuralEvent = { kind };
    if (taken.title) event.title = taken.title;
    segments.push({ type: 'structure', event });

    lastIndex = start + full.length + taken.consumed;
    CUE_FINDER.lastIndex = lastIndex;
    if (CUE_FINDER.lastIndex === match.index) CUE_FINDER.lastIndex++;
  }

  const tail = cleanText(transcript.slice(lastIndex));
  if (tail) segments.push({ type: 'text', text: tail });

  return segments;
}

/** Human-readable label for UI badges. */
export function labelForKind(kind: StructuralKind): string {
  switch (kind) {
    case 'chapter':
      return 'Chapter';
    case 'scene':
      return 'Scene';
    case 'section':
      return 'Section';
    case 'paragraph':
      return 'Paragraph';
  }
}
