import type { GenreId } from './types';
import { isThemeId, type ThemeId, type ThemeMode } from './theme';
import {
  normalizeDictationDraft,
  type DictationDraft,
} from './dictationDraft';

export const PERSIST_NAME = 'speakfiction-state-v1';
export const PERSIST_VERSION = 4;

export type AppTab = 'library' | 'dictate' | 'integrate' | 'model' | 'backup';

export const APP_TABS: AppTab[] = ['dictate', 'library', 'integrate', 'model', 'backup'];

export function isAppTab(value: unknown): value is AppTab {
  return APP_TABS.includes(value as AppTab);
}

/** Scroll + caret so the manuscript reopens where the writer left it. */
export interface ManuscriptPlace {
  scrollTop: number;
  blockId?: string;
  selectionStart?: number;
  selectionEnd?: number;
  /** Gap to insert dictation at (0…block count). Same slots as drag-and-drop. */
  atIndex?: number;
}

export function normalizeDictationDrafts(raw: unknown): Record<string, DictationDraft> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, DictationDraft> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const draft = normalizeDictationDraft(value);
    if (draft !== null) out[id] = draft;
  }
  return out;
}

export function normalizeManuscriptPlace(raw: unknown): Record<string, ManuscriptPlace> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, ManuscriptPlace> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const rec = value as Record<string, unknown>;
    const scrollTop = typeof rec.scrollTop === 'number' && Number.isFinite(rec.scrollTop) ? rec.scrollTop : 0;
    const place: ManuscriptPlace = { scrollTop };
    if (typeof rec.blockId === 'string' && rec.blockId) place.blockId = rec.blockId;
    if (typeof rec.selectionStart === 'number' && Number.isFinite(rec.selectionStart)) {
      place.selectionStart = rec.selectionStart;
    }
    if (typeof rec.selectionEnd === 'number' && Number.isFinite(rec.selectionEnd)) {
      place.selectionEnd = rec.selectionEnd;
    }
    if (typeof rec.atIndex === 'number' && Number.isFinite(rec.atIndex) && rec.atIndex >= 0) {
      place.atIndex = Math.floor(rec.atIndex);
    }
    out[id] = place;
  }
  return out;
}

export function normalizeThemeMode(value: unknown, fallback: ThemeMode): ThemeMode {
  return value === 'light' || value === 'dark' ? value : fallback;
}

export function normalizeThemeId(value: unknown, fallback: ThemeId): ThemeId {
  return typeof value === 'string' && isThemeId(value) ? value : fallback;
}

export function normalizeLastSeenVersion(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function normalizeManuscriptEditorOpen(value: unknown): boolean {
  return value === true;
}

/** Persist JSON from a previous run (`library-state.json` or zustand snapshot). */
export function persistSnapshotIndicatesPriorSession(raw: unknown): boolean {
  if (raw == null) return false;
  let value: unknown = raw;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return false;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return false;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  const state =
    rec.state && typeof rec.state === 'object' && !Array.isArray(rec.state)
      ? (rec.state as Record<string, unknown>)
      : rec;
  if (Array.isArray(state.books) && state.books.length > 0) return true;
  return 'state' in rec && 'version' in rec;
}

export function omitKey<T extends object>(record: T, key: string): T {
  const copy = { ...(record as Record<string, unknown>) };
  delete copy[key];
  return copy as T;
}

export type { GenreId };
