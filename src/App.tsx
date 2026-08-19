import { useLayoutEffect, useState } from 'react';
import { useStore } from './store';
import { LibraryView } from './views/LibraryView';
import { DictationView } from './views/DictationView';
import { IntegrationsView } from './views/IntegrationsView';
import { ModelView } from './views/ModelView';
import { BackupView } from './views/BackupView';
import { Logo } from './components/Logo';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { LicenseBanner } from './components/LicenseBanner';
import { UpdateBanner } from './components/UpdateBanner';
import { resolveThemeId } from './core/theme';
import { useLicense } from './hooks/useLicense';
import { useUpdater } from './hooks/useUpdater';

type Tab = 'library' | 'dictate' | 'integrate' | 'model' | 'backup';

const NAV: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'dictate', label: 'Dictate', icon: '🎙️' },
  { id: 'library', label: 'Library', icon: '📚' },
  { id: 'integrate', label: 'Integrations', icon: '🔗' },
  { id: 'model', label: 'On-Device Model', icon: '🧠' },
  { id: 'backup', label: 'Save & Export', icon: '💾' },
];

export default function App() {
  const license = useLicense();
  const updater = useUpdater();
  const [tab, setTab] = useState<Tab>('dictate');
  const [dictating, setDictating] = useState(false);
  const books = useStore((s) => s.books);
  const activeBookId = useStore((s) => s.activeBookId);
  const themeMode = useStore((s) => s.themeMode);
  const themeId = useStore((s) => s.themeId);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useStore((s) => s.setSidebarCollapsed);
  const activeBook = books.find((b) => b.id === activeBookId) ?? books[0] ?? null;
  const resolvedTheme = resolveThemeId(themeId, activeBook?.genreId);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-mode', themeMode);
    root.setAttribute('data-theme', resolvedTheme);
    root.style.colorScheme = themeMode;
  }, [themeMode, resolvedTheme]);

  return (
    <div className={`app${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <Logo size={34} />
          <div className="brand-copy">
            <h1>SpeakFiction</h1>
            <div className="tag">Dictation for fiction writers</div>
          </div>
          <button
            type="button"
            className="sidebar-toggle"
            aria-expanded={!sidebarCollapsed}
            aria-controls="app-nav"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? '›' : '‹'}
          </button>
        </div>

        <nav id="app-nav" className="sidebar-nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${tab === n.id ? 'active' : ''}`}
              onClick={() => setTab(n.id)}
              title={n.label}
            >
              <span className="ico">{n.icon}</span>
              <span className="nav-label">{n.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <ThemeSwitcher />
          <UpdateBanner updater={updater} dictating={dictating} />
          <LicenseBanner license={license} />
          <div className="sidebar-privacy">
            <strong>Private by design.</strong> Dictation, your name library, and the adaptive model
            all stay on this device.
          </div>
          <div
            className="sidebar-version"
            title={`Build ${__APP_BUILD__}. Click to check for updates.`}
            onClick={() => void updater.check()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                void updater.check();
              }
            }}
            role="button"
            tabIndex={0}
          >
            v{__APP_VERSION__}
          </div>
        </div>
      </aside>

      <main className="main">
        {!activeBook ? (
          <LibraryView />
        ) : tab === 'dictate' ? (
          <DictationView
            key={activeBook.id}
            book={activeBook}
            license={license}
            onListeningChange={setDictating}
          />
        ) : tab === 'library' ? (
          <LibraryView />
        ) : tab === 'integrate' ? (
          <IntegrationsView book={activeBook} />
        ) : tab === 'model' ? (
          <ModelView book={activeBook} />
        ) : (
          <BackupView book={activeBook} onOpenIntegrations={() => setTab('integrate')} />
        )}
      </main>
    </div>
  );
}
