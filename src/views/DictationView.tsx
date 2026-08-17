import { useCallback, useMemo, useState } from 'react';
import type { Book } from '../core/types';
import { useStore, type DictationOutcome } from '../store';
import { getGenre } from '../core/genres';
import { manuscriptStats } from '../core/manuscript';
import { ManuscriptView } from '../components/ManuscriptView';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

const SAMPLE =
  "new chapter titled The Oracle's Warning period " +
  'the wind howled across valthorn keep as kel dros climbed the frozen steps period ' +
  'new scene ' +
  "aleith waited in the dark comma her eyes bright with sun spar's glow period " +
  'open quote you should not have come close quote she said period ' +
  'new paragraph ' +
  'but kel dros only smiled comma the ashen order be damned period';

const COMMANDS = ['new chapter', 'new scene', 'new section', 'new paragraph', 'period', 'comma', 'question mark', 'open quote', 'close quote'];

export function DictationView({ book }: { book: Book }) {
  const applyDictation = useStore((s) => s.applyDictation);
  const [draft, setDraft] = useState('');
  const [outcome, setOutcome] = useState<DictationOutcome | null>(null);
  const genre = getGenre(book.genreId);
  const stats = useMemo(() => manuscriptStats(book.manuscript), [book.manuscript]);

  const handleFinal = useCallback((text: string) => {
    setDraft((d) => (d ? `${d} ${text}` : text));
  }, []);
  const speech = useSpeechRecognition(handleFinal);

  const insert = () => {
    const text = draft.trim();
    if (!text) return;
    const result = applyDictation(book.id, text);
    setOutcome(result);
    setDraft('');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Dictate</h2>
          <p>
            Speak naturally. SpeakFiction fixes your trained names, applies {genre.name.toLowerCase()}{' '}
            punctuation, and turns spoken cues like “new chapter” into real structure.
          </p>
        </div>
        <div className="book-pill">
          <span>📖</span>
          <b>{book.title}</b>
          <span>· {genre.name}</span>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 18 }}>
        <div className="stat">
          <div className="n">{stats.words.toLocaleString()}</div>
          <div className="l">Words</div>
        </div>
        <div className="stat">
          <div className="n">{stats.chapters}</div>
          <div className="l">Chapters</div>
        </div>
        <div className="stat">
          <div className="n">{stats.scenes}</div>
          <div className="l">Scenes</div>
        </div>
        <div className="stat">
          <div className="n">{book.nameLibrary.length}</div>
          <div className="l">Trained names</div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Dictation console</h3>
          <p className="sub">
            {speech.supported
              ? 'Use the mic, or type/paste a transcript to process.'
              : 'Live mic needs a microphone + a Chromium browser. Type or paste a transcript to process it here.'}
          </p>

          <div className="row" style={{ marginBottom: 14, gap: 16 }}>
            <button
              className={`mic-btn ${speech.listening ? 'recording' : ''}`}
              onClick={() => (speech.listening ? speech.stop() : speech.start())}
              disabled={!speech.supported}
              title={speech.supported ? 'Toggle dictation' : 'Microphone unavailable in this environment'}
            >
              {speech.listening ? '■' : '🎙️'}
            </button>
            <div className="hint">
              {speech.listening ? (
                <span style={{ color: 'var(--danger)' }}>Listening… {speech.interim}</span>
              ) : (
                <>
                  Say cues aloud: <span className="kbd">new chapter</span>{' '}
                  <span className="kbd">new scene</span> <span className="kbd">period</span>
                </>
              )}
              {speech.error && <div style={{ color: 'var(--warn)' }}>Mic: {speech.error}</div>}
            </div>
          </div>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={7}
            placeholder="e.g. new chapter kel dros drew sun spar period"
          />

          <div className="row wrap" style={{ margin: '10px 0' }}>
            {COMMANDS.map((c) => (
              <button
                key={c}
                className="badge"
                style={{ cursor: 'pointer' }}
                onClick={() => setDraft((d) => `${d}${d && !d.endsWith(' ') ? ' ' : ''}${c} `)}
              >
                + {c}
              </button>
            ))}
          </div>

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button className="btn ghost" onClick={() => setDraft(SAMPLE)}>
              Load sample
            </button>
            <div className="row">
              <button className="btn ghost" onClick={() => setDraft('')} disabled={!draft}>
                Clear
              </button>
              <button className="btn primary" onClick={insert} disabled={!draft.trim()}>
                Insert into manuscript ↵
              </button>
            </div>
          </div>

          {outcome && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
                <span className="badge">+{outcome.wordsAdded} words</span>
                {outcome.structureAdded > 0 && (
                  <span className="badge chapter">+{outcome.structureAdded} structure</span>
                )}
                {outcome.corrections.length === 0 && (
                  <span className="badge">no name fixes needed</span>
                )}
              </div>
              <div className="row wrap" style={{ gap: 8 }}>
                {outcome.corrections.map((c, i) => (
                  <span key={i} className="correction-chip">
                    <s>{c.from}</s> → <b>{c.to}</b>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h3>Manuscript</h3>
          <p className="sub">Everything below is editable. Structure was created from your spoken cues.</p>
          <div style={{ maxHeight: 520, overflowY: 'auto', paddingRight: 6 }}>
            <ManuscriptView book={book} />
          </div>
        </div>
      </div>
    </>
  );
}
