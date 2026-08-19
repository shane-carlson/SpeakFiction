import { useEffect, useRef, useState } from 'react';
import { CATEGORY_LABELS, useStore } from '../store';
import { GENRE_LIST } from '../core/genres';
import { TENSE_LIST, getTense } from '../core/tense';
import { PERSPECTIVE_LIST, getPerspective } from '../core/perspective';
import type { GenreId, NameCategory, NameEntry, PerspectiveId, TenseId } from '../core/types';

const CATEGORIES: NameCategory[] = ['character', 'location', 'item', 'organization', 'other'];

function parseAliases(raw: string): string[] {
  return raw.split(',').map((a) => a.trim()).filter(Boolean);
}

export function LibraryView() {
  const books = useStore((s) => s.books);
  const series = useStore((s) => s.series);
  const activeBookId = useStore((s) => s.activeBookId);
  const setActiveBook = useStore((s) => s.setActiveBook);
  const createBook = useStore((s) => s.createBook);
  const deleteBook = useStore((s) => s.deleteBook);
  const renameBook = useStore((s) => s.renameBook);
  const createSeries = useStore((s) => s.createSeries);
  const setBookSeries = useStore((s) => s.setBookSeries);
  const setGenre = useStore((s) => s.setGenre);
  const setTense = useStore((s) => s.setTense);
  const setPerspective = useStore((s) => s.setPerspective);
  const addNameEntry = useStore((s) => s.addNameEntry);
  const updateNameEntry = useStore((s) => s.updateNameEntry);
  const removeNameEntry = useStore((s) => s.removeNameEntry);

  const book = books.find((b) => b.id === activeBookId) ?? books[0] ?? null;
  const bookSeriesName = series.find((s) => s.id === book?.seriesId)?.name ?? '';

  const titleRef = useRef<HTMLInputElement>(null);
  const [focusTitle, setFocusTitle] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newGenre, setNewGenre] = useState<GenreId>('fantasy');
  const [seriesDraft, setSeriesDraft] = useState(bookSeriesName);

  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [canonical, setCanonical] = useState('');
  const [category, setCategory] = useState<NameCategory>('character');
  const [aliases, setAliases] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    setSeriesDraft(bookSeriesName);
  }, [book?.id, bookSeriesName]);

  useEffect(() => {
    setEditingNameId(null);
    setCanonical('');
    setCategory('character');
    setAliases('');
    setNote('');
  }, [book?.id]);

  useEffect(() => {
    if (!focusTitle) return;
    titleRef.current?.focus();
    titleRef.current?.select();
    setFocusTitle(false);
  }, [focusTitle, book?.id]);

  const assignSeries = (bookId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setBookSeries(bookId);
      setSeriesDraft('');
      return;
    }
    const existing = series.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setBookSeries(bookId, existing.id);
      setSeriesDraft(existing.name);
      return;
    }
    const id = createSeries(trimmed);
    setBookSeries(bookId, id);
    setSeriesDraft(trimmed);
  };

  const confirmDeleteBook = (id: string, title: string) => {
    const target = books.find((b) => b.id === id);
    if (!target) return;
    const blocks = target.manuscript.blocks.length;
    const names = target.nameLibrary.length;
    const last = books.length === 1;
    const extra = last ? ' This is your only book.' : '';
    if (
      !window.confirm(
        `Delete “${title}”? This removes its manuscript (${blocks} blocks) and ${names} trained names.${extra} This cannot be undone.`,
      )
    ) {
      return;
    }
    deleteBook(id);
  };

  const startEditName = (entry: NameEntry) => {
    setEditingNameId(entry.id);
    setCanonical(entry.canonical);
    setCategory(entry.category);
    setAliases(entry.aliases.join(', '));
    setNote(entry.note ?? '');
  };

  const cancelEditName = () => {
    setEditingNameId(null);
    setCanonical('');
    setCategory('character');
    setAliases('');
    setNote('');
  };

  const submitName = () => {
    if (!book || !canonical.trim()) return;
    const payload = {
      canonical: canonical.trim(),
      category,
      aliases: parseAliases(aliases),
      note: note.trim() || undefined,
    };
    if (editingNameId) {
      updateNameEntry(book.id, { id: editingNameId, ...payload });
    } else {
      addNameEntry(book.id, payload);
    }
    cancelEditName();
  };

  const confirmRemoveName = (entry: NameEntry) => {
    if (!book) return;
    if (!window.confirm(`Remove “${entry.canonical}” from this book’s name library?`)) return;
    if (editingNameId === entry.id) cancelEditName();
    removeNameEntry(book.id, entry.id);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Library</h2>
          <p>
            Each book (or series) has its own trained vocabulary of characters, places, and items,
            plus genre punctuation, narrative tense, and the perspective you write in.
          </p>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Your books</h3>
          <p className="sub">Select a book to dictate into, or edit its details on the right.</p>
          {books.map((b) => (
            <div
              key={b.id}
              className={`list-row clickable ${b.id === book?.id ? 'selected' : ''}`}
              onClick={() => setActiveBook(b.id)}
            >
              <div className="grow">
                <div className="name">{b.title}</div>
                <div className="aliases">
                  {GENRE_LIST.find((g) => g.id === b.genreId)?.name} · {getTense(b.tenseId).name} ·{' '}
                  {getPerspective(b.perspectiveId).name} · {b.nameLibrary.length} names ·{' '}
                  {b.manuscript.blocks.length} blocks
                </div>
              </div>
              {b.id === book?.id && <span className="badge character">active</span>}
              <div className="list-row-actions">
                <button
                  type="button"
                  className="btn ghost compact"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveBook(b.id);
                    setFocusTitle(true);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn danger compact"
                  onClick={(e) => {
                    e.stopPropagation();
                    confirmDeleteBook(b.id, b.title);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}

          <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
            <div className="field">
              <label>New book title</label>
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Winter of Glass" />
            </div>
            <div className="row">
              <select value={newGenre} onChange={(e) => setNewGenre(e.target.value as GenreId)}>
                {GENRE_LIST.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <button
                className="btn primary"
                onClick={() => {
                  if (newTitle.trim()) {
                    createBook(newTitle.trim(), newGenre);
                    setNewTitle('');
                  }
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Book details</h3>
          <p className="sub">
            Title, series, genre, tense, and perspective. Genre shapes quotes and dashes; tense and
            perspective shape narration and spoken-tag cleanup.
          </p>
          {book && (
            <>
              <div className="field">
                <label htmlFor="book-title">Title</label>
                <input
                  id="book-title"
                  ref={titleRef}
                  value={book.title}
                  onChange={(e) => renameBook(book.id, e.target.value)}
                  onBlur={() => {
                    if (!book.title.trim()) renameBook(book.id, 'Untitled book');
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="book-series">Series (optional)</label>
                <input
                  id="book-series"
                  list="existing-series"
                  value={seriesDraft}
                  onChange={(e) => setSeriesDraft(e.target.value)}
                  onBlur={() => assignSeries(book.id, seriesDraft)}
                  placeholder="Leave blank for a standalone book"
                />
                <datalist id="existing-series">
                  {series.map((s) => (
                    <option key={s.id} value={s.name} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label htmlFor="book-genre">Genre profile</label>
                <select
                  id="book-genre"
                  value={book.genreId}
                  onChange={(e) => setGenre(book.id, e.target.value as GenreId)}
                >
                  {GENRE_LIST.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              {GENRE_LIST.filter((g) => g.id === book.genreId).map((g) => (
                <div key={g.id} className="hint" style={{ marginBottom: 16 }}>
                  <p style={{ marginTop: 0 }}>{g.description}</p>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <span className="badge">{g.quoteStyle === 'curly' ? '“curly” quotes' : '"straight" quotes'}</span>
                    <span className="badge">{g.dashStyle}-dash</span>
                    <span className="badge">{g.oxfordComma ? 'Oxford comma' : 'no Oxford comma'}</span>
                    <span className="badge">scene break {g.sceneBreakGlyph}</span>
                  </div>
                </div>
              ))}
              <div className="field">
                <label htmlFor="book-tense">Tense</label>
                <select
                  id="book-tense"
                  value={book.tenseId ?? 'past'}
                  onChange={(e) => setTense(book.id, e.target.value as TenseId)}
                >
                  {TENSE_LIST.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="hint" style={{ marginBottom: 16 }}>
                <p style={{ marginTop: 0 }}>{getTense(book.tenseId).description}</p>
                <p>
                  {getTense(book.tenseId).narrativeHint} Spoken slips like “he says” vs “he said”
                  follow this; quoted dialogue is left as the character spoke it.
                </p>
              </div>
              <div className="field">
                <label htmlFor="book-perspective">Perspective</label>
                <select
                  id="book-perspective"
                  value={book.perspectiveId ?? 'third-limited'}
                  onChange={(e) => setPerspective(book.id, e.target.value as PerspectiveId)}
                >
                  {PERSPECTIVE_LIST.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="hint" style={{ marginBottom: 16 }}>
                <p style={{ marginTop: 0 }}>{getPerspective(book.perspectiveId).description}</p>
                <p>{getPerspective(book.perspectiveId).narrativeHint}</p>
              </div>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => confirmDeleteBook(book.id, book.title)}
                >
                  Delete book
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {book && (
        <div className="card">
          <h3>Name library — {book.title}</h3>
          <p className="sub">
            Trained proper nouns. Aliases are the ways speech-to-text mishears them; SpeakFiction
            rewrites any close match to the canonical spelling.
          </p>

          <div className="grid cols-2" style={{ marginBottom: 16 }}>
            <div>
              <div className="field">
                <label>Canonical spelling</label>
                <input value={canonical} onChange={(e) => setCanonical(e.target.value)} placeholder="Kaeldros" />
              </div>
              <div className="row">
                <div style={{ flex: 1 }}>
                  <label>Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value as NameCategory)}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div>
              <div className="field">
                <label>Aliases / misheard forms (comma-separated)</label>
                <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="kaldros, kel dros" />
              </div>
              <div className="field">
                <label>Note (optional)</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="exiled swordmaster" />
              </div>
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginBottom: 18 }}>
            {editingNameId && (
              <button type="button" className="btn ghost" onClick={cancelEditName}>
                Cancel
              </button>
            )}
            <button className="btn primary" onClick={submitName} disabled={!canonical.trim()}>
              {editingNameId ? 'Save name' : '+ Add name'}
            </button>
          </div>

          <div>
            {book.nameLibrary.length === 0 && <div className="empty">No trained names yet.</div>}
            {book.nameLibrary.map((n) => (
              <div key={n.id} className={`list-row ${editingNameId === n.id ? 'selected' : ''}`}>
                <span className={`badge ${n.category}`}>{CATEGORY_LABELS[n.category]}</span>
                <div className="grow">
                  <div className="name">{n.canonical}</div>
                  <div className="aliases">
                    {n.aliases.length ? `hears: ${n.aliases.join(', ')}` : 'no aliases'}
                    {n.note ? ` · ${n.note}` : ''}
                  </div>
                </div>
                <div className="list-row-actions">
                  <button type="button" className="btn ghost compact" onClick={() => startEditName(n)}>
                    Edit
                  </button>
                  <button type="button" className="btn danger compact" onClick={() => confirmRemoveName(n)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
