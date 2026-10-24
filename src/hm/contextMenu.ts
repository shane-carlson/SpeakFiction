import type { InputEvidence, InsertionOrigin } from './certification';

/** Gap between the menu and the viewport edge. */
export const MENU_MARGIN = 8;

const WORD = /[\p{L}\p{N}'’-]+/gu;

export interface WordSpan {
  word: string;
  start: number;
  end: number;
}

/** Word that contains `offset`, including a caret sitting on the word's trailing boundary. */
export function wordAroundOffset(text: string, offset: number): WordSpan | null {
  const at = Math.max(0, Math.min(offset, text.length));
  WORD.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD.exec(text))) {
    const start = match.index;
    const end = start + match[0].length;
    if (at >= start && at <= end) return { word: match[0], start, end };
  }
  return null;
}

export function normalizeSpellSuggestions(word: string, list: readonly unknown[] | null | undefined): string[] {
  if (!list?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const same = word.toLowerCase();
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || trimmed.toLowerCase() === same || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Suggestions the platform attached to the context menu event.
 * Returns null when the page cannot read them (do not invent a list).
 */
export function suggestionsFromPlatformEvent(event: object | null | undefined, word: string): string[] | null {
  if (!event) return null;
  const record = event as { dictionarySuggestions?: unknown; spellcheckSuggestions?: unknown };
  if (Array.isArray(record.dictionarySuggestions)) {
    return normalizeSpellSuggestions(word, record.dictionarySuggestions);
  }
  if (Array.isArray(record.spellcheckSuggestions)) {
    return normalizeSpellSuggestions(word, record.spellcheckSuggestions);
  }
  return null;
}

/**
 * System suggestions for one word.
 * Electron passes the built-in dictionary via `platform`. A browser event contributes
 * only when it actually carries a suggestion list. An empty result stays empty.
 */
export function collectSpellSuggestions(args: {
  word: string;
  event?: object | null;
  platform?: ((word: string) => readonly unknown[] | null | undefined) | null;
}): string[] {
  const fromEvent = suggestionsFromPlatformEvent(args.event, args.word);
  if (fromEvent) return fromEvent;
  if (typeof args.platform !== 'function') return [];
  try {
    const list = args.platform(args.word);
    if (!Array.isArray(list)) return [];
    return normalizeSpellSuggestions(args.word, list);
  } catch {
    return [];
  }
}

/**
 * A spelling replacement is an ordinary non-keyboard edit.
 * `origin: 'other'` matches find-and-replace: the new letters are not keyboard-sealed.
 */
export function spellcheckReplacement(args: {
  start: number;
  end: number;
  insert: string;
  at: string;
}): {
  start: number;
  end: number;
  insert: string;
  origin: InsertionOrigin;
  event: InputEvidence;
  caret: number;
} {
  return {
    start: args.start,
    end: args.end,
    insert: args.insert,
    origin: 'other',
    event: {
      at: args.at,
      inputType: 'insertReplacementText',
      data: args.insert,
      trusted: true,
    },
    caret: args.start + args.insert.length,
  };
}

export interface MenuPlacement {
  top: number;
  left: number;
  maxHeight: number;
  maxWidth: number;
}

function placeAxis(anchor: number, size: number, viewport: number, margin: number): number {
  const spaceAfter = viewport - margin - anchor;
  const spaceBefore = anchor - margin;
  let pos = anchor;
  if (size > spaceAfter && spaceBefore > spaceAfter) pos = anchor - size;
  if (pos < margin) pos = margin;
  if (pos + size > viewport - margin) pos = Math.max(margin, viewport - margin - size);
  return pos;
}

/** Flip toward the side with more room, then clamp so the menu stays inside the viewport. */
export function placeContextMenu(args: {
  anchorX: number;
  anchorY: number;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  margin?: number;
}): MenuPlacement {
  const margin = args.margin ?? MENU_MARGIN;
  const maxHeight = Math.max(0, args.viewportHeight - margin * 2);
  const maxWidth = Math.max(0, args.viewportWidth - margin * 2);
  const height = Math.min(Math.max(0, args.menuHeight), maxHeight);
  const width = Math.min(Math.max(0, args.menuWidth), maxWidth);
  return {
    top: placeAxis(args.anchorY, height, args.viewportHeight, margin),
    left: placeAxis(args.anchorX, width, args.viewportWidth, margin),
    maxHeight,
    maxWidth,
  };
}
