import type { GenreId } from './types';
import { GENRES, getGenre } from './genres';

export type ThemeMode = 'light' | 'dark';
/** `auto` follows the active book’s genre. Any GenreId is an explicit override. */
export type ThemeId = GenreId | 'auto';

export const DEFAULT_THEME_MODE: ThemeMode = 'dark';
export const DEFAULT_THEME_ID: ThemeId = 'auto';

const GENRE_IDS = new Set<string>(Object.keys(GENRES));

export function isGenreId(id: string | undefined | null): id is GenreId {
  return Boolean(id && GENRE_IDS.has(id));
}

export function isThemeId(id: string | undefined | null): id is ThemeId {
  return id === 'auto' || isGenreId(id);
}

/** Palette actually applied to `html[data-theme]`. */
export function resolveThemeId(themeId: ThemeId, bookGenreId: GenreId | undefined | null): GenreId {
  if (themeId !== 'auto') return themeId;
  return isGenreId(bookGenreId) ? bookGenreId : 'generic';
}

export function applyDocumentTheme(
  themeMode: ThemeMode,
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
