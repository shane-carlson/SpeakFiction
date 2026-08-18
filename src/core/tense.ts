import type { TenseId, TenseProfile } from './types';

export const TENSES: Record<TenseId, TenseProfile> = {
  past: {
    id: 'past',
    name: 'Past',
    description: 'The default for most fiction. Narration is told after the fact.',
    narrativeHint:
      'Narration matches past tense (he said). Dialogue keeps whatever tense the character spoke.',
  },
  present: {
    id: 'present',
    name: 'Present',
    description: 'Common in YA and some literary work. Narration happens as it unfolds.',
    narrativeHint:
      'Narration matches present tense (he says). Dialogue keeps whatever tense the character spoke.',
  },
  future: {
    id: 'future',
    name: 'Future',
    description: 'Rare; prophecy, speculative, or experimental narration.',
    narrativeHint:
      'Narration is framed as future. Dialogue is left alone; tags are not rewritten.',
  },
  'past-perfect': {
    id: 'past-perfect',
    name: 'Past perfect',
    description: 'Had-done framing for recollection or nested backstory.',
    narrativeHint:
      'Narration sits in past perfect. Dialogue tags still use said; quoted speech is unchanged.',
  },
};

export const TENSE_LIST: TenseProfile[] = Object.values(TENSES);

export const DEFAULT_TENSE: TenseId = 'past';

export function getTense(id: TenseId | string | undefined | null): TenseProfile {
  if (id && id in TENSES) return TENSES[id as TenseId];
  return TENSES.past;
}

const TENSE_CUE =
  /\b(?:(?:please|now)\s+)?(?:write in|switch to|set(?:\s+to)?|use)\s+(?:the\s+)?(past(?:[ -]perfect)?|present|future) tense\b/gi;
const BARE_TENSE_CUE = /\b(past(?:[ -]perfect)?|present|future) tense\b/gi;

/** Strip spoken tense announcements so they are not inserted as prose. */
export function stripSpokenTenseCues(text: string): string {
  return text
    .replace(TENSE_CUE, ' ')
    .replace(BARE_TENSE_CUE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rewriteTag(subject: string, tense: TenseId): string {
  if (tense === 'future') return '';
  const plural = /^(they|we)$/i.test(subject);
  if (tense === 'present') return `${subject} ${plural ? 'say' : 'says'}`;
  return `${subject} said`;
}

function applyTags(narration: string, tense: TenseId): string {
  if (tense === 'future') return narration;
  return narration.replace(/\b(he|she|they|we|I)\s+(says|said|say)\b/gi, (full, subject: string) => {
    const next = rewriteTag(subject, tense);
    return next || full;
  });
}

function applyStarters(narration: string, tense: TenseId): string {
  if (tense === 'past' || tense === 'past-perfect') {
    return narration.replace(/(^|[.!?]\s+)I go\b/g, '$1I went');
  }
  if (tense === 'present') {
    return narration.replace(/(^|[.!?]\s+)I went\b/g, '$1I go');
  }
  return narration;
}

/**
 * Transform only narration (outside quotes). Quoted dialogue is never rewritten.
 * Conservative: dialogue tags (says/said) plus sentence-initial I go / I went.
 */
export function applyNarrativeTense(text: string, tense: TenseId): string {
  const quoted = /([\u201C"][^\u201D"]*(?:[\u201D"]|$))/g;
  let last = 0;
  let out = '';
  let match: RegExpExecArray | null;
  const transform = (chunk: string) => applyStarters(applyTags(chunk, tense), tense);
  while ((match = quoted.exec(text))) {
    out += transform(text.slice(last, match.index));
    out += match[0];
    last = match.index + match[0].length;
  }
  out += transform(text.slice(last));
  return out;
}

export function applyTenseCleanup(text: string, tense: TenseId): string {
  return applyNarrativeTense(stripSpokenTenseCues(text), tense);
}
