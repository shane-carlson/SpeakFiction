import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { applyDocumentTheme, readOsPrefersDark, resolveThemeMode } from './core/theme';
import { flushSessionPersist } from './core/sessionStorage';
import { manuscriptVersionRecorder } from './core/manuscriptVersionsLive';
import { useStore } from './store';

function bindFlush() {
  const flush = () => {
    flushSessionPersist();
    const s = useStore.getState();
    const book = s.books.find((b) => b.id === s.activeBookId);
    if (book) void manuscriptVersionRecorder().flush(book.id, book.manuscript.blocks);
  };
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

async function boot() {
  try {
    await useStore.persist.rehydrate();
  } catch {
    /* first launch or unreadable storage — keep in-memory defaults */
  }
  const s = useStore.getState();
  const book = s.books.find((b) => b.id === s.activeBookId) ?? s.books[0];
  applyDocumentTheme(resolveThemeMode(s.themeMode, readOsPrefersDark()), s.themeId, book?.genreId);
  bindFlush();
  for (const item of s.books) {
    void manuscriptVersionRecorder().ensureBaseline(item.id, item.manuscript.blocks);
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void boot();
