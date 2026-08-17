import type { Book } from '../core/types';
import { learningProgress, suggestCanonical } from '../core/adaptiveModel';
import { getGenre } from '../core/genres';

export function ModelView({ book }: { book: Book }) {
  const genre = getGenre(book.genreId);
  const progress = learningProgress(book.adaptive);
  const corrections = Object.entries(book.adaptive.corrections);
  const topVocab = Object.entries(book.adaptive.vocabulary)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  // A gentle, illustrative confidence curve based on words seen.
  const confidence = Math.min(100, Math.round((progress.wordsSeen / 2000) * 100));

  return (
    <>
      <div className="page-head">
        <div>
          <h2>On-Device Model</h2>
          <p>
            A private model that adapts to <b>your</b> voice, vocabulary, and genre — trained on this
            device from your corrections. No prose ever leaves your Mac.
          </p>
        </div>
        <div className="book-pill">
          <span>🧠</span>
          <b>{book.title}</b>
          <span>· {genre.name} base</span>
        </div>
      </div>

      <div className="note-banner" style={{ marginBottom: 18 }}>
        <span className="ico">⚖️</span>
        <div>
          <b>Ethically sourced.</b> The genre base models are built only from public-domain and
          Creative-Commons-licensed fiction — never from writing that authors were not compensated
          for. Your personal adaptation layer is yours alone.
        </div>
      </div>

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="stat">
          <div className="n">{progress.wordsSeen.toLocaleString()}</div>
          <div className="l">Words learned from</div>
        </div>
        <div className="stat">
          <div className="n">{progress.uniqueWords.toLocaleString()}</div>
          <div className="l">Personal vocabulary</div>
        </div>
        <div className="stat">
          <div className="n">{progress.learnedCorrections}</div>
          <div className="l">Learned name fixes</div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Adaptation to your style</h3>
          <p className="sub">
            The more you dictate, the more confidently SpeakFiction predicts your names and cadence.
          </p>
          <div className="progress" style={{ marginBottom: 8 }}>
            <span style={{ width: `${Math.max(4, confidence)}%` }} />
          </div>
          <div className="hint">{confidence}% adapted to your {genre.name.toLowerCase()} voice</div>

          <div style={{ marginTop: 18 }}>
            <label>Most-used words in your prose</label>
            <div className="row wrap" style={{ gap: 6 }}>
              {topVocab.length === 0 && <span className="hint">Dictate to begin building your profile.</span>}
              {topVocab.map(([w, c]) => (
                <span key={w} className="badge">
                  {w} · {c}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Learned corrections</h3>
          <p className="sub">Spoken forms the model now maps to your canonical names automatically.</p>
          {corrections.length === 0 ? (
            <div className="empty">No corrections learned yet. Dictate a name that gets auto-fixed.</div>
          ) : (
            corrections.map(([spoken]) => (
              <div key={spoken} className="list-row">
                <div className="grow">
                  <span className="aliases">heard</span> <b>{spoken}</b>
                </div>
                <span className="correction-chip">→ {suggestCanonical(book.adaptive, spoken)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
