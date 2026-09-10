import type { GenreId } from './types';
import { GENRES, getGenre } from './genres';

/** Stored appearance: `system` follows the OS until Light or Dark is chosen. */
export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedThemeMode = 'light' | 'dark';
/** `auto` follows the active book’s genre. Any GenreId is an explicit override. */
export type ThemeId = GenreId | 'auto';

export const DEFAULT_THEME_MODE: ThemeMode = 'system';
export const DEFAULT_THEME_ID: ThemeId = 'auto';

const GENRE_IDS = new Set<string>(Object.keys(GENRES));

export function isGenreId(id: string | undefined | null): id is GenreId {
  return Boolean(id && GENRE_IDS.has(id));
}

export function isThemeId(id: string | undefined | null): id is ThemeId {
  return id === 'auto' || isGenreId(id);
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** OS dark-mode bit. Falls back to dark when the platform cannot say. */
export function readOsPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function subscribeOsPrefersDark(onChange: (dark: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => onChange(mq.matches);
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }
  mq.addListener(handler);
  return () => mq.removeListener(handler);
}

export function resolveThemeMode(preference: ThemeMode, osDark = readOsPrefersDark()): ResolvedThemeMode {
  if (preference === 'light' || preference === 'dark') return preference;
  return osDark ? 'dark' : 'light';
}

export function themeModeLabel(preference: ThemeMode, resolved: ResolvedThemeMode): string {
  if (preference === 'system') return `System (${resolved === 'dark' ? 'Dark' : 'Light'})`;
  return preference === 'dark' ? 'Dark' : 'Light';
}

/** Palette actually applied to `html[data-theme]`. */
export function resolveThemeId(themeId: ThemeId, bookGenreId: GenreId | undefined | null): GenreId {
  if (themeId !== 'auto') return themeId;
  return isGenreId(bookGenreId) ? bookGenreId : 'generic';
}

export function applyDocumentTheme(
  themeMode: ResolvedThemeMode,
  themeId: ThemeId,
  bookGenreId?: GenreId | null,
): void {
  const root = document.documentElement;
  root.setAttribute('data-mode', themeMode);
  root.setAttribute('data-theme', resolveThemeId(themeId, bookGenreId));
  root.style.colorScheme = themeMode;
}

export function themeDisplayName(themeId: ThemeId, resolved: GenreId): string {
  const name = getGenre(resolved).name;
  return themeId === 'auto' ? `${name} (book)` : name;
}
