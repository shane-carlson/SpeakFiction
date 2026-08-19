/**
 * Native Electron/Chromium spellcheck helpers for the manuscript context menu.
 * Suggestions are prepended so they sit above insert/structure actions.
 */

import { normalizeMarks } from './richText';
import type { InlineMark } from './types';

export const SPELLCHECK_SUGGEST_PREFIX = 'spell-suggest:';
export const SPELLCHECK_ADD_ID = 'spell-add-dictionary';
export const SPELLCHECK_NO_SUGGESTIONS_ID = 'spell-no-suggestions';

export interface SpellcheckHit {
  misspelledWord: string;
  dictionarySuggestions: string[];
}

export interface SpellcheckMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  group: string;
}

const WORD_CHAR = /[A-Za-z0-9'’\-]/;

export function pickSpellCheckerLanguages(
  available: string[] | undefined,
  locale: string,
  fallback = 'en-US',
): string[] {
  const list = Array.isArray(available) ? available : [];
  const normalized = String(locale || fallback).replace(/_/g, '-');
  if (list.includes(normalized)) return [normalized];
  const prefix = normalized.split('-')[0] || fallback;
  const matches = list.filter((l) => l === prefix || l.startsWith(`${prefix}-`));
  if (matches.includes(fallback)) return [fallback];
  if (matches.length) return [matches[0]!];
  if (list.includes(fallback)) return [fallback];
  return list.slice(0, 1);
}

export function normalizeSpellcheckHit(raw: unknown): SpellcheckHit {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const misspelledWord = typeof o.misspelledWord === 'string' ? o.misspelledWord : '';
  const dictionarySuggestions = Array.isArray(o.dictionarySuggestions)
    ? o.dictionarySuggestions.filter((s): s is string => typeof s === 'string' && s.length > 0)
    : [];
  return { misspelledWord, dictionarySuggestions };
}

export function spellcheckMenuItems(hit: SpellcheckHit | null | undefined): SpellcheckMenuItem[] {
  if (!hit?.misspelledWord) return [];
  const suggestions = hit.dictionarySuggestions.filter(Boolean);
  const items: SpellcheckMenuItem[] = suggestions.map((label) => ({
    id: `${SPELLCHECK_SUGGEST_PREFIX}${label}`,
    label,
    group: 'spellcheck',
  }));
  if (!items.length) {
    items.push({
      id: SPELLCHECK_NO_SUGGESTIONS_ID,
      label: 'No suggestions',
      group: 'spellcheck',
      disabled: true,
    });
  }
  items.push({
    id: SPELLCHECK_ADD_ID,
    label: `Add “${hit.misspelledWord}” to dictionary`,
    group: 'spellcheck-dict',
  });
  return items;
}

/** Put dictionary suggestions (and Add to dictionary) ahead of other menu items. */
export function withSpellcheckItems<T extends SpellcheckMenuItem>(
  items: T[],
  hit: SpellcheckHit | null | undefined,
): Array<T | SpellcheckMenuItem> {
  const top = spellcheckMenuItems(hit);
  return top.length ? [...top, ...items] : items;
}

export function suggestionFromMenuId(id: string): string | null {
  if (!id.startsWith(SPELLCHECK_SUGGEST_PREFIX)) return null;
  const suggestion = id.slice(SPELLCHECK_SUGGEST_PREFIX.length);
  return suggestion || null;
}

export function expandWordAt(text: string, offset: number): { start: number; end: number } {
  const t = text ?? '';
  const pos = Math.max(0, Math.min(Math.floor(offset), t.length));
  let start = pos;
  let end = pos;
  if ((pos < t.length && WORD_CHAR.test(t[pos] ?? '')) || (pos > 0 && WORD_CHAR.test(t[pos - 1] ?? ''))) {
    while (start > 0 && WORD_CHAR.test(t[start - 1] ?? '')) start--;
    while (end < t.length && WORD_CHAR.test(t[end] ?? '')) end++;
  }
  return { start, end };
}

function isWordBoundary(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) return true;
  return !WORD_CHAR.test(text[index - 1] ?? '') || !WORD_CHAR.test(text[index] ?? '');
}

export function findMisspelledRange(
  text: string,
  misspelledWord: string,
  aroundOffset?: number,
): { start: number; end: number } | null {
  const t = text ?? '';
  const word = misspelledWord ?? '';
  if (!t || !word) return null;
  if (typeof aroundOffset === 'number') {
    const at = expandWordAt(t, aroundOffset);
    if (t.slice(at.start, at.end) === word) return at;
  }
  const origin = typeof aroundOffset === 'number' ? aroundOffset : 0;
  let best: { start: number; end: number } | null = null;
  let bestDist = Infinity;
  let from = 0;
  while (from <= t.length) {
    const i = t.indexOf(word, from);
    if (i < 0) break;
    const end = i + word.length;
    if (isWordBoundary(t, i) && isWordBoundary(t, end)) {
      const dist = Math.min(Math.abs(origin - i), Math.abs(origin - end));
      if (dist < bestDist) {
        bestDist = dist;
        best = { start: i, end };
      }
    }
    from = i + 1;
  }
  return best;
}

export function replaceMisspelledWord(
  text: string,
  misspelledWord: string,
  suggestion: string,
  aroundOffset?: number,
): string {
  const range = findMisspelledRange(text, misspelledWord, aroundOffset);
  if (!range) return text;
  return text.slice(0, range.start) + suggestion + text.slice(range.end);
}

export function remapMarksAfterReplace(
  marks: InlineMark[] | undefined,
  start: number,
  oldEnd: number,
  insertLength: number,
  nextLength: number,
): InlineMark[] {
  const delta = insertLength - (oldEnd - start);
  const next: InlineMark[] = [];
  for (const m of marks ?? []) {
    let a = m.start;
    let b = m.end;
    if (b <= start) {
      next.push(m);
      continue;
    }
    if (a >= oldEnd) {
      next.push({ ...m, start: a + delta, end: b + delta });
      continue;
    }
    if (a < start) {
      b = b <= oldEnd ? start + insertLength : b + delta;
    } else {
      a = start;
      b = b <= oldEnd ? start + insertLength : b + delta;
    }
    if (b > a) next.push({ ...m, start: a, end: b });
  }
  return normalizeMarks(next, nextLength);
}

export function replaceMisspelledInMarkedText(
  text: string,
  marks: InlineMark[] | undefined,
  misspelledWord: string,
  suggestion: string,
  aroundOffset?: number,
): { text: string; marks: InlineMark[] } {
  const range = findMisspelledRange(text, misspelledWord, aroundOffset);
  if (!range) return { text, marks: normalizeMarks(marks, text.length) };
  const nextText = text.slice(0, range.start) + suggestion + text.slice(range.end);
  return {
    text: nextText,
    marks: remapMarksAfterReplace(marks, range.start, range.end, suggestion.length, nextText.length),
  };
}

export function createSpellcheckGate() {
  let pending: SpellcheckHit | null = null;
  const waiters = new Set<(hit: SpellcheckHit | null) => void>();

  const settleWaiter = (waiter: (hit: SpellcheckHit | null) => void, hit: SpellcheckHit | null) => {
    if (!waiters.has(waiter)) return;
    waiters.delete(waiter);
    waiter(hit);
  };

  return {
    offer(raw: unknown) {
      const hit = normalizeSpellcheckHit(raw);
      const waiter = waiters.values().next().value as ((h: SpellcheckHit | null) => void) | undefined;
      if (waiter) {
        settleWaiter(waiter, hit);
        return;
      }
      pending = hit;
    },
    takeImmediate(): SpellcheckHit | null {
      const hit = pending;
      pending = null;
      return hit;
    },
    take(timeoutMs: number): Promise<SpellcheckHit | null> {
      const immediate = this.takeImmediate();
      if (immediate) return Promise.resolve(immediate);
      if (timeoutMs <= 0) return Promise.resolve(null);
      return new Promise((resolve) => {
        let settled = false;
        const waiter = (hit: SpellcheckHit | null) => {
          if (settled) return;
          settled = true;
          waiters.delete(waiter);
          clearTimeout(timer);
          resolve(hit);
        };
        const timer = setTimeout(() => waiter(null), timeoutMs);
        waiters.add(waiter);
      });
    },
  };
}

export const manuscriptSpellcheckGate = createSpellcheckGate();
