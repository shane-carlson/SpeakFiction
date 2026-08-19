import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { applyDocumentTheme } from './core/theme';
import { flushSessionPersist } from './core/sessionStorage';
import { useStore } from './store';

function bindFlush() {
  const flush = () => flushSessionPersist();
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
  applyDocumentTheme(s.themeMode, s.themeId, book?.genreId);
  bindFlush();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void boot();
