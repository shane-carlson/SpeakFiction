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

const FINDER = new RegExp(
  `\\b(${CMD_ALTERNATION})\\b` +
    `(?:[\\s,]*(?:titled|called|named|entitled)\\s+(.+?)(?=\\s*\\b(?:${CMD_ALTERNATION})\\b|[.!?]|$))?`,
  'gi',
);

function cleanText(raw: string): string {
  return raw.replace(/^[\s.,;:!?]+/, '').replace(/\s+/g, ' ').trim();
}

function normalizePhrase(matched: string): string {
  return matched.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Split a raw transcript into ordered prose + structure segments. Titles are
 * captured when spoken as "new chapter titled/called/named ...".
 */
export function parseAudioCues(transcript: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  FINDER.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = FINDER.exec(transcript)) !== null) {
    const [full, phrase, title] = match;
    const start = match.index;

    const before = cleanText(transcript.slice(lastIndex, start));
    if (before) segments.push({ type: 'text', text: before });

    const kind = KIND_BY_PHRASE.get(normalizePhrase(phrase)) ?? 'section';
    const event: StructuralEvent = { kind };
    const trimmedTitle = title?.trim().replace(/[.!?,;:]+$/, '');
    if (trimmedTitle) event.title = trimmedTitle;
    segments.push({ type: 'structure', event });

    lastIndex = start + full.length;
    // Avoid zero-length loops on empty matches.
    if (FINDER.lastIndex === match.index) FINDER.lastIndex++;
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
