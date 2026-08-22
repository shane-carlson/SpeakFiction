import { useEffect, useLayoutEffect, useState } from 'react';
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
import { WhatsNewModal } from './components/WhatsNewModal';
import { HelpTicketModal } from './components/HelpTicketModal';
import { ViewErrorBoundary } from './components/ViewErrorBoundary';
import type { TicketKind } from './core/ticket';
import { applyDocumentTheme } from './core/theme';
import type { AppTab } from './core/persistedState';
import { useLicense } from './hooks/useLicense';
import { useUpdater } from './hooks/useUpdater';
import { useWhatsNew } from './hooks/useWhatsNew';

const NAV: Array<{ id: AppTab; label: string; icon: string }> = [
  { id: 'dictate', label: 'Dictate', icon: '🎙️' },
  { id: 'library', label: 'Library', icon: '📚' },
  { id: 'integrate', label: 'Integrations', icon: '🔗' },
  { id: 'model', label: 'On-Device Model', icon: '🧠' },
  { id: 'backup', label: 'Save & Export', icon: '💾' },
];

export default function App() {
  const license = useLicense();
  const updater = useUpdater();
  const whatsNew = useWhatsNew();
  const tab = useStore((s) => s.activeTab);
  const setTab = useStore((s) => s.setActiveTab);
  const [dictating, setDictating] = useState(false);
  const [ticketKind, setTicketKind] = useState<TicketKind | null>(null);
  const books = useStore((s) => s.books);
  const activeBookId = useStore((s) => s.activeBookId);
  const themeMode = useStore((s) => s.themeMode);
  const themeId = useStore((s) => s.themeId);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useStore((s) => s.setSidebarCollapsed);
  const activeBook = books.find((b) => b.id === activeBookId) ?? books[0] ?? null;

  useLayoutEffect(() => {
    applyDocumentTheme(themeMode, themeId, activeBook?.genreId);
  }, [themeMode, themeId, activeBook?.genreId]);

  useEffect(() => {
    return window.speakfiction?.help?.onOpenTicket((kind) => {
      if (kind === 'support' || kind === 'feature') setTicketKind(kind);
    });
  }, []);

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
          <ViewErrorBoundary
            title="Library could not open"
            hint="The page failed to load. Your books are still on this machine."
          >
            <LibraryView />
          </ViewErrorBoundary>
        ) : tab === 'dictate' ? (
          <DictationView
            key={activeBook.id}
            book={activeBook}
            license={license}
            onListeningChange={setDictating}
          />
        ) : tab === 'library' ? (
          <ViewErrorBoundary
            title="Library could not open"
            hint="The page failed to load. Your books are still on this machine."
          >
            <LibraryView />
          </ViewErrorBoundary>
        ) : tab === 'integrate' ? (
          <IntegrationsView book={activeBook} />
        ) : tab === 'model' ? (
          <ModelView book={activeBook} />
        ) : (
          <BackupView book={activeBook} onOpenIntegrations={() => setTab('integrate')} />
        )}
      </main>
      <WhatsNewModal
        open={whatsNew.open}
        version={whatsNew.version}
        build={whatsNew.build}
        notes={whatsNew.notes}
        onDismiss={whatsNew.dismiss}
      />
      <HelpTicketModal kind={ticketKind} onClose={() => setTicketKind(null)} />
    </div>
  );
}
