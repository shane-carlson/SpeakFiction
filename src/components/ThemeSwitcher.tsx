import { GENRE_LIST } from '../core/genres';
import {
  readOsPrefersDark,
  resolveThemeId,
  resolveThemeMode,
  themeDisplayName,
  themeModeLabel,
  type ThemeId,
  type ThemeMode,
} from '../core/theme';
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
  const resolvedMode = resolveThemeMode(themeMode, readOsPrefersDark());
  const modes: Array<{ id: ThemeMode; label: string }> = [
    { id: 'system', label: 'System' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ];

  return (
    <div className="theme-switcher">
      <div className="theme-switcher-label">Appearance</div>
      <div className="theme-mode-seg" role="group" aria-label="Color mode">
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={themeMode === mode.id ? 'on' : ''}
            aria-pressed={themeMode === mode.id}
            onClick={() => setThemeMode(mode.id)}
          >
            {mode.label}
          </button>
        ))}
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
        {label} · {themeModeLabel(themeMode, resolvedMode)}
      </div>
    </div>
  );
}
