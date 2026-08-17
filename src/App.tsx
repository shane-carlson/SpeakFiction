import { useState } from 'react';
import { useStore } from './store';
import { LibraryView } from './views/LibraryView';
import { DictationView } from './views/DictationView';
import { IntegrationsView } from './views/IntegrationsView';
import { ModelView } from './views/ModelView';

type Tab = 'library' | 'dictate' | 'integrate' | 'model';

const NAV: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'dictate', label: 'Dictate', icon: '🎙️' },
  { id: 'library', label: 'Library', icon: '📚' },
  { id: 'integrate', label: 'Integrations', icon: '🔗' },
  { id: 'model', label: 'On-Device Model', icon: '🧠' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('dictate');
  const books = useStore((s) => s.books);
  const activeBookId = useStore((s) => s.activeBookId);
  const activeBook = books.find((b) => b.id === activeBookId) ?? books[0] ?? null;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">S</div>
          <div>
            <h1>SpeakFiction</h1>
            <div className="tag">Dictation for fiction writers</div>
          </div>
        </div>

        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav-item ${tab === n.id ? 'active' : ''}`}
            onClick={() => setTab(n.id)}
          >
            <span className="ico">{n.icon}</span>
            {n.label}
          </button>
        ))}

        <div className="sidebar-footer">
          <div>
            <strong>Private by design.</strong> Dictation, your name library, and the adaptive model
            all stay on this device.
          </div>
        </div>
      </aside>

      <main className="main">
        {!activeBook ? (
          <LibraryView />
        ) : tab === 'dictate' ? (
          <DictationView book={activeBook} />
        ) : tab === 'library' ? (
          <LibraryView />
        ) : tab === 'integrate' ? (
          <IntegrationsView book={activeBook} />
        ) : (
          <ModelView book={activeBook} />
        )}
      </main>
    </div>
  );
}
