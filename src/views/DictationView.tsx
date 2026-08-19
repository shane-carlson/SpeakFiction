import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Book } from '../core/types';
import { useStore, type DictationOutcome } from '../store';
import { getGenre } from '../core/genres';
import { getTense } from '../core/tense';
import { getPerspective } from '../core/perspective';
import { cleanupDictationText } from '../core/dictationProcessor';
import { manuscriptStats } from '../core/manuscript';
import { ManuscriptView } from '../components/ManuscriptView';
import { AudioSettingsPanel } from '../components/AudioSettings';
import { SplitPane } from '../components/SplitPane';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { LicenseGate } from '../components/LicenseGate';
import type { useLicense } from '../hooks/useLicense';

const SAMPLE =
  "new chapter titled The Oracle's Warning period " +
  'the wind howled across valthorn keep as kel dros climbed the frozen steps period ' +
  'new scene ' +
  "aleith waited in the dark comma her eyes bright with sun spar's glow period " +
  'open quote you should not have come close quote she said period ' +
  'new paragraph ' +
  'but kel dros only smiled comma the ashen order be damned period';

const COMMANDS = ['new chapter', 'new scene', 'new section', 'new paragraph', 'period', 'comma', 'question mark', 'open quote', 'close quote'];

function joinDraft(prev: string, next: string): string {
  if (!prev.trim()) return next;
  if (!next.trim()) return prev;
  const a = prev.replace(/\s+$/, '');
  const b = next.replace(/^\s+/, '');
  if (/[\u201C"][^\n]*$/.test(a) && /^[\u201C"]/.test(b)) return `${a}\n\n${b}`;
  return `${a} ${b}`;
}

function isTypingField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.isContentEditable;
}

export function DictationView({
  book,
  license,
  onListeningChange,
}: {
  book: Book;
  license: ReturnType<typeof useLicense>;
  onListeningChange?: (listening: boolean) => void;
}) {
  const books = useStore((s) => s.books);
  const setActiveBook = useStore((s) => s.setActiveBook);
  const applyDictation = useStore((s) => s.applyDictation);
  const rememberSttProfile = useStore((s) => s.rememberSttProfile);
  const savedProfileLabel = useStore((s) => s.sttProfileLabel);
  const dictateSplit = useStore((s) => s.dictateSplit);
  const setDictateSplit = useStore((s) => s.setDictateSplit);
  const [draft, setDraft] = useState('');
  const [outcome, setOutcome] = useState<DictationOutcome | null>(null);
  const [showProfile, setShowProfile] = useState(true);
  const genre = getGenre(book.genreId);
  const tense = getTense(book.tenseId);
  const perspective = getPerspective(book.perspectiveId);
  const stats = useMemo(() => manuscriptStats(book.manuscript), [book.manuscript]);

  const audioSettings = useStore((s) => s.audioSettings);
  const handleFinal = useCallback(
    (text: string) => {
      const cleaned = cleanupDictationText(text, {
        entries: book.nameLibrary,
        genre,
        tense: book.tenseId,
        perspective: book.perspectiveId,
        adaptive: book.adaptive,
      });
      if (!cleaned) return;
      setDraft((d) => joinDraft(d, cleaned));
    },
    [book.adaptive, book.nameLibrary, book.perspectiveId, book.tenseId, genre],
  );

  const appendCue = useCallback((cue: string) => {
    setDraft((d) => `${d}${d && !/[ \n]$/.test(d) ? ' ' : ''}${cue} `);
  }, []);
  const handleProfile = useCallback(
    (profile: { label: string }) => {
      rememberSttProfile(profile.label);
      setShowProfile(true);
    },
    [rememberSttProfile],
  );
  const speech = useSpeechRecognition(handleFinal, audioSettings, handleProfile, {
    mayDictate: license.mayDictate,
  });
  const profileLabel = speech.profileLabel || savedProfileLabel;

  useEffect(() => {
    onListeningChange?.(speech.session === 'listening');
    return () => onListeningChange?.(false);
  }, [onListeningChange, speech.session]);

  useEffect(() => {
    if (!profileLabel) return;
    setShowProfile(true);
    const t = window.setTimeout(() => setShowProfile(false), 8000);
    return () => window.clearTimeout(t);
  }, [profileLabel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.repeat) return;
      const target = e.target;
      const inField = isTypingField(target);
      const inTranscript =
        target instanceof HTMLElement && target.classList.contains('dictation-transcript');
      const listening = speech.session === 'listening';
      const meta = e.metaKey || e.ctrlKey;

      const insert = (cue: string) => {
        e.preventDefault();
        e.stopPropagation();
        appendCue(cue);
      };

      if (meta && e.key === 'Enter' && inTranscript) {
        insert(e.shiftKey ? 'new section' : 'new chapter');
        return;
      }

      const steal = listening || !inField;
      if (!steal) return;

      if (e.key === 'Enter') {
        insert(e.shiftKey ? 'new section' : 'new chapter');
        return;
      }
      if (e.key === ' ' || e.code === 'Space') {
        insert(e.shiftKey ? 'new scene' : 'new paragraph');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [appendCue, speech.session]);

  const sessionLabel =
    speech.session === 'listening'
      ? speech.transcribing
        ? 'Transcribing…'
        : `Listening… ${speech.interim}`
      : speech.session === 'paused'
        ? 'Paused — say “start dictation” or press the mic'
        : 'Stopped — press the mic to start';

  const insert = () => {
    const text = draft.trim();
    if (!text) return;
    const result = applyDictation(book.id, text);
    setOutcome(result);
    setDraft('');
  };

  return (
    <div className="dictate-page">
      <div className="page-head">
        <div>
          <h2>Dictate</h2>
          <p>
            Speak naturally. SpeakFiction fixes your trained names, applies {genre.name.toLowerCase()}{' '}
            punctuation, keeps narration in {tense.name.toLowerCase()} {perspective.name.toLowerCase()}, and
            turns spoken cues like “new chapter” into real structure.
          </p>
        </div>
        <label className="book-pill book-pill-select-wrap">
          <span>📖</span>
          <select
            className="book-pill-select"
            value={book.id}
            onChange={(e) => setActiveBook(e.target.value)}
            aria-label="Active book"
          >
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
          <span className="book-pill-meta">· {genre.name} · {tense.name} · {perspective.name}</span>
        </label>
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

      <SplitPane
        ratio={dictateSplit}
        onRatioChange={setDictateSplit}
        aria-label="Resize dictation console and manuscript"
        left={
        <div className="card dictate-card dictate-console">
          <h3>Dictation console</h3>
          <p className="sub">
            {speech.supported
              ? 'Use the mic, or type/paste a transcript to process. Speech is transcribed on this device. Pause to commit a line. Voice commands are not inserted into the transcript.'
              : 'Live mic needs a microphone. Type or paste a transcript to process it here.'}
          </p>

          <LicenseGate license={license} />

          {showProfile && profileLabel && (
            <div className="stt-profile" role="status">
              {profileLabel}
            </div>
          )}

          <div className="row" style={{ marginBottom: 14, gap: 16 }}>
            <button
              className={`mic-btn ${speech.session === 'listening' ? 'recording' : ''} ${speech.session === 'paused' ? 'paused' : ''}`}
              onClick={() => (speech.session === 'listening' ? speech.pause() : void speech.start())}
              disabled={!speech.supported || !license.mayDictate}
              title={
                !license.mayDictate
                  ? 'License required to dictate'
                  : speech.supported
                    ? speech.session === 'listening'
                      ? 'Pause dictation'
                      : 'Start dictation'
                    : 'Microphone unavailable'
              }
            >
              {speech.session === 'listening' ? '❚❚' : '🎙️'}
            </button>
            <button
              className="btn ghost"
              onClick={() => speech.stop()}
              disabled={!speech.supported || speech.session === 'stopped'}
            >
              Stop
            </button>
            <div className="hint" style={{ flex: 1 }}>
              {speech.modelProgress != null && speech.modelProgress < 100 ? (
                <span>Loading on-device speech model… {Math.round(speech.modelProgress)}%</span>
              ) : (
                <span style={{ color: speech.session === 'listening' ? 'var(--danger)' : speech.session === 'paused' ? 'var(--warn)' : undefined }}>
                  {sessionLabel}
                </span>
              )}
              <div className="hint" style={{ marginTop: 4 }}>
                Say <span className="kbd">start dictation</span> <span className="kbd">pause dictation</span>{' '}
                <span className="kbd">stop dictation</span>
              </div>
              <div className="hint" style={{ marginTop: 6 }}>
                While listening: <span className="kbd">Space</span> new paragraph ·{' '}
                <span className="kbd">Enter</span> new chapter · <span className="kbd">Shift+Space</span> new
                scene · <span className="kbd">Shift+Enter</span> new section. The next sentence is the
                title. Editing the box: <span className="kbd">⌘Enter</span> new chapter.
              </div>
              <div className="audio-meter" aria-hidden="true">
                <span style={{ width: `${speech.session !== 'stopped' || speech.level > 1 ? Math.max(4, speech.level) : 0}%` }} />
              </div>
              {speech.error && <div style={{ color: 'var(--warn)' }}>Mic: {speech.error}</div>}
            </div>
          </div>

          <AudioSettingsPanel />

          <textarea
            className="dictation-transcript"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={14}
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
        }
        right={
        <div className="card dictate-card">
          <h3>Manuscript</h3>
          <p className="sub">Everything below is editable. Structure was created from your spoken cues.</p>
          <div className="dictate-ms-scroll">
            <ManuscriptView book={book} />
          </div>
        </div>
        }
      />
    </div>
  );
}
