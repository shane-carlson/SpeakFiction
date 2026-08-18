import { useState } from 'react';
import { CATEGORY_LABELS, useStore } from '../store';
import { GENRE_LIST } from '../core/genres';
import { TENSE_LIST, getTense } from '../core/tense';
import { PERSPECTIVE_LIST, getPerspective } from '../core/perspective';
import type { GenreId, NameCategory, PerspectiveId, TenseId } from '../core/types';

const CATEGORIES: NameCategory[] = ['character', 'location', 'item', 'organization', 'other'];

export function LibraryView() {
  const books = useStore((s) => s.books);
  const activeBookId = useStore((s) => s.activeBookId);
  const setActiveBook = useStore((s) => s.setActiveBook);
  const createBook = useStore((s) => s.createBook);
  const setGenre = useStore((s) => s.setGenre);
  const setTense = useStore((s) => s.setTense);
  const setPerspective = useStore((s) => s.setPerspective);
  const addNameEntry = useStore((s) => s.addNameEntry);
  const removeNameEntry = useStore((s) => s.removeNameEntry);

  const book = books.find((b) => b.id === activeBookId) ?? books[0] ?? null;

  const [newTitle, setNewTitle] = useState('');
  const [newGenre, setNewGenre] = useState<GenreId>('fantasy');

  const [canonical, setCanonical] = useState('');
  const [category, setCategory] = useState<NameCategory>('character');
  const [aliases, setAliases] = useState('');
  const [note, setNote] = useState('');

  const submitName = () => {
    if (!book || !canonical.trim()) return;
    addNameEntry(book.id, {
      canonical: canonical.trim(),
      category,
      aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
      note: note.trim() || undefined,
    });
    setCanonical('');
    setAliases('');
    setNote('');
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
          <p className="sub">Select the active book to dictate into.</p>
          {books.map((b) => (
            <button
              key={b.id}
              className={`list-row ${b.id === book?.id ? 'selected' : ''}`}
              style={{
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
                borderColor: b.id === book?.id ? 'var(--accent)' : undefined,
                marginBottom: 8,
              }}
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
            </button>
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
          <h3>Genre, tense & perspective</h3>
          <p className="sub">
            Genre shapes quotes and dashes. Tense and perspective shape narration and spoken-tag cleanup.
          </p>
          {book && (
            <>
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
                <p>{getTense(book.tenseId).narrativeHint} Spoken slips like “he says” vs “he said” follow this; quoted dialogue is left as the character spoke it.</p>
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
              <div className="hint">
                <p style={{ marginTop: 0 }}>{getPerspective(book.perspectiveId).description}</p>
                <p>{getPerspective(book.perspectiveId).narrativeHint}</p>
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
          <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 18 }}>
            <button className="btn primary" onClick={submitName} disabled={!canonical.trim()}>
              + Add name
            </button>
          </div>

          <div>
            {book.nameLibrary.length === 0 && <div className="empty">No trained names yet.</div>}
            {book.nameLibrary.map((n) => (
              <div key={n.id} className="list-row">
                <span className={`badge ${n.category}`}>{CATEGORY_LABELS[n.category]}</span>
                <div className="grow">
                  <div className="name">{n.canonical}</div>
                  <div className="aliases">
                    {n.aliases.length ? `hears: ${n.aliases.join(', ')}` : 'no aliases'}
                    {n.note ? ` · ${n.note}` : ''}
                  </div>
                </div>
                <button className="btn danger" onClick={() => removeNameEntry(book.id, n.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
