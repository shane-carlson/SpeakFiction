import { GENRE_LIST } from '../core/genres';
import { resolveThemeId, themeDisplayName } from '../core/theme';
import type { ThemeId } from '../core/theme';
import { useStore } from '../store';

export function ThemeSwitcher() {
  const themeMode = useStore((s) => s.themeMode);
  const themeId = useStore((s) => s.themeId);
  const setThemeMode = useStore((s) => s.setThemeMode);
  const setThemeId = useStore((s) => s.setThemeId);
  const books = useStore((s) => s.books);
  const activeBookId = useStore((s) => s.activeBookId);
  const book = books.find((b) => b.id === activeBookId) ?? books[0] ?? null;
  const resolved = resolveThemeId(themeId, book?.genreId);
  const label = themeDisplayName(themeId, resolved);

  return (
    <div className="theme-switcher">
      <div className="theme-switcher-label">Appearance</div>
      <div className="theme-mode-seg" role="group" aria-label="Color mode">
        <button
          type="button"
          className={themeMode === 'light' ? 'on' : ''}
          aria-pressed={themeMode === 'light'}
          onClick={() => setThemeMode('light')}
        >
          Light
        </button>
        <button
          type="button"
          className={themeMode === 'dark' ? 'on' : ''}
          aria-pressed={themeMode === 'dark'}
          onClick={() => setThemeMode('dark')}
        >
          Dark
        </button>
      </div>
      <label className="theme-palette-label">
        Palette
        <select
          className="theme-palette-select"
          value={themeId}
          onChange={(e) => setThemeId(e.target.value as ThemeId)}
          aria-label="Genre theme"
        >
          <option value="auto">Match book genre</option>
          {GENRE_LIST.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <div className="theme-switcher-current">
        {label} · {themeMode === 'dark' ? 'Dark' : 'Light'}
      </div>
    </div>
  );
}
