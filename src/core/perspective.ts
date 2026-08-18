import type { PerspectiveId, PerspectiveProfile } from './types';

export const PERSPECTIVES: Record<PerspectiveId, PerspectiveProfile> = {
  first: {
    id: 'first',
    name: 'First person',
    description: 'The narrator is I — a character inside the story.',
    narrativeHint:
      'Narration uses I. After a quote, a stray “he said” / “she said” tag becomes I said. Quoted dialogue is never rewritten, and character names are left alone.',
  },
  'third-limited': {
    id: 'third-limited',
    name: 'Third limited',
    description: 'He/she/they, close to one viewpoint character. Common commercial fiction.',
    narrativeHint:
      'Narration stays in third person. Quoted dialogue (including I) is untouched. Names and pronouns in narration are not rewritten.',
  },
  'third-omniscient': {
    id: 'third-omniscient',
    name: 'Third omniscient',
    description: 'He/she/they with access to more than one mind.',
    narrativeHint:
      'Narration stays in third person. Dialogue and names are not rewritten; only the profile is stored for context.',
  },
  second: {
    id: 'second',
    name: 'Second person',
    description: 'You as the protagonist. Rare and usually experimental.',
    narrativeHint:
      'Narration is you. Prose is left alone except storing this profile for UI and adaptive context.',
  },
};

export const PERSPECTIVE_LIST: PerspectiveProfile[] = Object.values(PERSPECTIVES);

export const DEFAULT_PERSPECTIVE: PerspectiveId = 'third-limited';

export function getPerspective(id: PerspectiveId | string | undefined | null): PerspectiveProfile {
  if (id && id in PERSPECTIVES) return PERSPECTIVES[id as PerspectiveId];
  return PERSPECTIVES['third-limited'];
}

const WRITE_CUE =
  /\b(?:(?:please|now)\s+)?(?:write in|switch to|set(?:\s+to)?|use)\s+(?:the\s+)?(?:first|second|third(?:[ -]person)?(?:[ -](?:limited|omniscient))?)(?:\s+person)?\b/gi;

/** Strip spoken perspective announcements so they are not inserted as prose. */
export function stripSpokenPerspectiveCues(text: string): string {
  return text
    .replace(WRITE_CUE, ' ')
    .replace(/\bthird(?:[ -]person)?(?:[ -]omniscient)\b/gi, ' ')
    .replace(/\bthird(?:[ -]person)?(?:[ -]limited)\b/gi, ' ')
    .replace(/\b(?:first|second|third) person\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyFirstPersonTags(narration: string): string {
  // Only the attribution that starts a narration span (immediately after a quote).
  return narration.replace(
    /^(\s*)(he|she)\s+(said|says|say)\b/i,
    (_full, space: string, _who: string, verb: string) => {
      const v = verb.toLowerCase() === 'said' ? 'said' : 'say';
      return `${space}I ${v}`;
    },
  );
}

/**
 * Transform only narration (outside quotes). Quoted dialogue is never rewritten.
 * First person: post-quote he/she said → I said. Third/second: no pronoun rewrites.
 */
export function applyNarrativePerspective(text: string, perspective: PerspectiveId): string {
  if (perspective !== 'first') return text;
  const quoted = /([\u201C"][^\u201D"]*(?:[\u201D"]|$))/g;
  let last = 0;
  let out = '';
  let afterQuote = false;
  let match: RegExpExecArray | null;
  while ((match = quoted.exec(text))) {
    const narration = text.slice(last, match.index);
    out += afterQuote ? applyFirstPersonTags(narration) : narration;
    out += match[0];
    afterQuote = true;
    last = match.index + match[0].length;
  }
  const tail = text.slice(last);
  out += afterQuote ? applyFirstPersonTags(tail) : tail;
  return out;
}

export function applyPerspectiveCleanup(text: string, perspective: PerspectiveId): string {
  const stripped = stripSpokenPerspectiveCues(text);
  return applyNarrativePerspective(stripped, perspective);
}
