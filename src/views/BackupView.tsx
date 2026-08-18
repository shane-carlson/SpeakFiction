import { useMemo, useState } from 'react';
import type { Book } from '../core/types';
import { getGenre } from '../core/genres';
import { getTense } from '../core/tense';
import { getPerspective } from '../core/perspective';
import { manuscriptStats } from '../core/manuscript';
import { toMarkdown, toPlainText, toRtf, type ExportContext } from '../core/export';
import { docxToBlob } from '../core/exportDocx';
import {
  BACKUP_KIND_BOOK,
  BACKUP_KIND_LIBRARY,
  backupToJson,
  bookBackupFilename,
  libraryBackupFilename,
  parseBackup,
  serializeBookBackup,
  serializeLibraryBackup,
  type SpeakFictionBackup,
} from '../core/backup';
import { openTextFile, saveBytesFile, saveTextFile } from '../core/localFiles';
import { useStore } from '../store';

const JSON_FILTERS = [{ name: 'SpeakFiction backup', extensions: ['json'] }];

function statusFromSave(ok: boolean, path?: string, canceled = 'Save canceled.'): string {
  if (!ok) return canceled;
  return path ? `Saved to ${path}` : 'Downloaded to your files.';
}

export function BackupView({
  book,
  onOpenIntegrations,
}: {
  book: Book;
  onOpenIntegrations: () => void;
}) {
  const series = useStore((s) => s.series);
  const books = useStore((s) => s.books);
  const activeBookId = useStore((s) => s.activeBookId);
  const themeMode = useStore((s) => s.themeMode);
  const themeId = useStore((s) => s.themeId);
  const audioSettings = useStore((s) => s.audioSettings);
  const sttProfileLabel = useStore((s) => s.sttProfileLabel);
  const importBookBackup = useStore((s) => s.importBookBackup);
  const importLibraryBackup = useStore((s) => s.importLibraryBackup);

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<SpeakFictionBackup | null>(null);

  const genre = getGenre(book.genreId);
  const tense = getTense(book.tenseId);
  const perspective = getPerspective(book.perspectiveId);
  const stats = useMemo(() => manuscriptStats(book.manuscript), [book.manuscript]);
  const bookSeries = series.find((s) => s.id === book.seriesId) ?? null;
  const ctx: ExportContext = useMemo(() => ({ title: book.title, genre }), [book.title, genre]);
  const slug = bookBackupFilename(book).replace(/\.speakfiction\.json$/, '');

  const report = (message: string) => {
    setError(null);
    setStatus(message);
  };

  const fail = (message: string) => {
    setStatus(null);
    setError(message);
  };

  const saveBookJson = async () => {
    const json = backupToJson(serializeBookBackup(book, bookSeries));
    const res = await saveTextFile({
      defaultPath: bookBackupFilename(book),
      content: json,
      filters: JSON_FILTERS,
      mime: 'application/json',
    });
    report(statusFromSave(res.ok, res.path));
  };

  const saveLibraryJson = async () => {
    const json = backupToJson(
      serializeLibraryBackup({
        series,
        books,
        activeBookId,
        themeMode,
        themeId,
        audioSettings,
        sttProfileLabel,
      }),
    );
    const res = await saveTextFile({
      defaultPath: libraryBackupFilename(),
      content: json,
      filters: JSON_FILTERS,
      mime: 'application/json',
    });
    report(statusFromSave(res.ok, res.path));
  };

  const exportFormat = async (format: 'json' | 'rtf' | 'md' | 'docx' | 'txt') => {
    if (format === 'json') {
      await saveBookJson();
      return;
    }
    if (format === 'rtf') {
      const res = await saveTextFile({
        defaultPath: `${slug}.rtf`,
        content: toRtf(book.manuscript, ctx),
        filters: [{ name: 'Rich Text', extensions: ['rtf'] }],
        mime: 'application/rtf',
      });
      report(statusFromSave(res.ok, res.path));
      return;
    }
    if (format === 'md') {
      const res = await saveTextFile({
        defaultPath: `${slug}.md`,
        content: toMarkdown(book.manuscript, ctx),
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        mime: 'text/markdown',
      });
      report(statusFromSave(res.ok, res.path));
      return;
    }
    if (format === 'txt') {
      const res = await saveTextFile({
        defaultPath: `${slug}.txt`,
        content: toPlainText(book.manuscript, ctx),
        filters: [{ name: 'Plain text', extensions: ['txt'] }],
        mime: 'text/plain',
      });
      report(statusFromSave(res.ok, res.path));
      return;
    }
    const blob = await docxToBlob(book.manuscript, ctx);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const res = await saveBytesFile({
      defaultPath: `${slug}.docx`,
      bytes,
      filters: [{ name: 'Word document', extensions: ['docx'] }],
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    report(statusFromSave(res.ok, res.path));
  };

  const chooseImport = async () => {
    setPending(null);
    const text = await openTextFile({ filters: JSON_FILTERS });
    if (text == null) {
      report('Import canceled.');
      return;
    }
    try {
      setPending(parseBackup(text));
      setError(null);
      setStatus('Backup loaded. Choose how to restore it.');
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Could not read that backup.');
    }
  };

  const restoreBook = (replaceExisting: boolean) => {
    if (!pending || pending.kind !== BACKUP_KIND_BOOK) return;
    const result = importBookBackup(pending, replaceExisting);
    if (result === 'exists') {
      fail(`“${pending.book.title}” is already in the library. Confirm replace to overwrite it.`);
      return;
    }
    setPending(null);
    report(result === 'replaced' ? `Replaced “${pending.book.title}”.` : `Added “${pending.book.title}”.`);
  };

  const restoreLibrary = (mode: 'merge' | 'replace') => {
    if (!pending || pending.kind !== BACKUP_KIND_LIBRARY) return;
    const incomingIds = new Set(pending.books.map((b) => b.id));
    const overlap = books.filter((b) => incomingIds.has(b.id));
    if (mode === 'replace') {
      const ok = window.confirm(
        `Replace the entire library (${books.length} book${books.length === 1 ? '' : 's'}) with this backup (${pending.books.length} book${pending.books.length === 1 ? '' : 's'})? Theme and audio settings will also be replaced. This cannot be undone from here.`,
      );
      if (!ok) return;
    } else if (overlap.length > 0) {
      const names = overlap.map((b) => b.title).join(', ');
      const ok = window.confirm(
        `${overlap.length} book${overlap.length === 1 ? '' : 's'} already exist and will be updated: ${names}. Other books stay. Continue?`,
      );
      if (!ok) return;
    }
    importLibraryBackup(pending, mode);
    setPending(null);
    report(
      mode === 'replace'
        ? `Replaced the library with ${pending.books.length} book${pending.books.length === 1 ? '' : 's'}.`
        : `Merged ${pending.books.length} book${pending.books.length === 1 ? '' : 's'} into the library.`,
    );
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Save & Export</h2>
          <p>
            Keep books and their settings on this Mac. JSON backups include the manuscript, name
            library, genre, tense, perspective, series, and adaptive model. A full library backup
            also stores theme and audio settings.
          </p>
        </div>
        <div className="book-pill">
          <span>💾</span>
          <b>{book.title}</b>
          <span>
            · {genre.name} · {tense.name} · {perspective.name} · {stats.words} words
          </span>
        </div>
      </div>

      <div className="note-banner" style={{ marginBottom: 18 }}>
        <span className="ico">📁</span>
        <div>
          <b>Local only.</b> Files are written with the system save dialog in the desktop app, or
          downloaded in the browser preview. Nothing is uploaded.
        </div>
      </div>

      {(status || error) && (
        <div className={`note-banner ${error ? 'warn' : ''}`} style={{ marginBottom: 18 }}>
          <span className="ico">{error ? '⚠️' : '✅'}</span>
          <div>{error ?? status}</div>
        </div>
      )}

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Save / backup</h3>
          <p className="sub">
            JSON snapshot you can restore later. Zustand still auto-saves in the browser; this is
            an explicit file on disk.
          </p>
          <div className="row wrap">
            <button className="btn primary" onClick={() => void saveBookJson()}>
              Save current book
            </button>
            <button className="btn" onClick={() => void saveLibraryJson()}>
              Save entire library
            </button>
          </div>
          <p className="hint" style={{ marginTop: 12 }}>
            Defaults to <code>{bookBackupFilename(book)}</code> or{' '}
            <code>{libraryBackupFilename()}</code>.
          </p>
        </div>

        <div className="card">
          <h3>Export current book</h3>
          <p className="sub">
            Manuscript formats reuse the Integrations exporters. JSON is the full book backup.
          </p>
          <div className="row wrap">
            <button className="btn" onClick={() => void exportFormat('json')}>
              JSON
            </button>
            <button className="btn" onClick={() => void exportFormat('rtf')}>
              RTF
            </button>
            <button className="btn" onClick={() => void exportFormat('md')}>
              Markdown
            </button>
            <button className="btn" onClick={() => void exportFormat('docx')}>
              DOCX
            </button>
            <button className="btn" onClick={() => void exportFormat('txt')}>
              TXT
            </button>
          </div>
          <p className="hint" style={{ marginTop: 12 }}>
            Need the Scrivener / Word wizard?{' '}
            <button className="btn ghost" style={{ padding: '0 4px' }} onClick={onOpenIntegrations}>
              Open Integrations
            </button>
          </p>
        </div>
      </div>

      <div className="card">
        <h3>Restore / import JSON</h3>
        <p className="sub">
          Open a <code>.speakfiction.json</code> book file or a <code>speakfiction-library.json</code>{' '}
          backup. Unrelated books stay unless you replace the whole library.
        </p>
        <div className="row wrap">
          <button className="btn primary" onClick={() => void chooseImport()}>
            Open backup…
          </button>
        </div>

        {pending?.kind === BACKUP_KIND_BOOK && (
          <div style={{ marginTop: 16 }}>
            <p>
              Book backup: <b>{pending.book.title}</b>
              {pending.series ? ` · series ${pending.series.name}` : ''} ·{' '}
              {pending.book.manuscript.blocks.length} blocks
            </p>
            <div className="row wrap" style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={() => restoreBook(false)}>
                Add to library
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  const exists = books.some((b) => b.id === pending.book.id);
                  if (exists) {
                    const ok = window.confirm(
                      `Replace the existing book “${pending.book.title}”? Other books will not be removed.`,
                    );
                    if (!ok) return;
                  }
                  restoreBook(true);
                }}
              >
                Replace if it already exists
              </button>
            </div>
          </div>
        )}

        {pending?.kind === BACKUP_KIND_LIBRARY && (
          <div style={{ marginTop: 16 }}>
            <p>
              Library backup: <b>{pending.books.length}</b> book
              {pending.books.length === 1 ? '' : 's'} · {pending.series.length} series · theme{' '}
              {pending.themeMode}/{pending.themeId}
            </p>
            <div className="row wrap" style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={() => restoreLibrary('merge')}>
                Merge into library
              </button>
              <button className="btn danger" onClick={() => restoreLibrary('replace')}>
                Replace entire library
              </button>
            </div>
            <p className="hint" style={{ marginTop: 10 }}>
              Merge updates matching book ids and adds new ones. Theme and audio change only on
              replace.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
