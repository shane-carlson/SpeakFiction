import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Book } from '../core/types';
import { useStore, type DictationOutcome } from '../store';
import { getGenre } from '../core/genres';
import { getTense } from '../core/tense';
import { getPerspective } from '../core/perspective';
import { cleanupDictationText } from '../core/dictationProcessor';
import { mergeSeriesNameLibrary } from '../core/seriesNames';
import {
  appendCueText,
  caretAfterJoin,
  draftText,
  insertCueAt,
  joinDraftAt,
  plainDraft,
  strikeLastSentence,
  takeInsertTranscript,
  type DictationDraft,
} from '../core/dictationDraft';
import { DICTATION_COMMAND_CHIPS } from '../core/dictationContextMenu';
import {
  destFromPlace,
  manuscriptStats,
  advanceInsertPlace,
  type ManuscriptInsertAt,
  type ManuscriptInsertKind,
  type StructureHeadingKind,
} from '../core/manuscript';
import { containsStructureCue } from '../core/audioCues';
import { ManuscriptView } from '../components/ManuscriptView';
import { ManuscriptToolbar } from '../components/ManuscriptToolbar';
import { DictationTranscript } from '../components/DictationTranscript';
import { EditorDictationStrip } from '../components/EditorDictationStrip';
import { AudioSettingsPanel } from '../components/AudioSettings';
import { SplitPane } from '../components/SplitPane';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { LicenseGate } from '../components/LicenseGate';
import type { useLicense } from '../hooks/useLicense';
import type { DictationCommand } from '../core/voiceCommands';
import type { InlineMarkKind } from '../core/types';
import {
  MANUSCRIPT_SPLIT_DEFAULT,
  MANUSCRIPT_SPLIT_MAX,
  MANUSCRIPT_SPLIT_MIN,
  MANUSCRIPT_SPLIT_MIN_PX,
} from '../core/splitRatio';
import { IMAGE_ACCEPT } from '../core/manuscriptMedia';
import { ingestManuscriptImage } from '../core/mediaStore';
import { openBytesFile } from '../core/localFiles';

const SAMPLE =
  "new chapter titled The Oracle's Warning period " +
  'the wind howled across valthorn keep as kel dros climbed the frozen steps period ' +
  'new scene ' +
  "aleith waited in the dark comma her eyes bright with sun spar's glow period " +
  'open quote you should not have come close quote she said period ' +
  'new paragraph ' +
  'but kel dros only smiled comma the ashen order be damned period';

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
  const addNameEntry = useStore((s) => s.addNameEntry);
  const rememberSttProfile = useStore((s) => s.rememberSttProfile);
  const savedProfileLabel = useStore((s) => s.sttProfileLabel);
  const dictateSplit = useStore((s) => s.dictateSplit);
  const setDictateSplit = useStore((s) => s.setDictateSplit);
  const manuscriptSplit = useStore((s) => s.manuscriptSplit);
  const setManuscriptSplit = useStore((s) => s.setManuscriptSplit);
  const editorOpen = useStore((s) => s.manuscriptEditorOpen);
  const setEditorOpen = useStore((s) => s.setManuscriptEditorOpen);
  const draft = useStore((s) => s.dictationDrafts[book.id] ?? []);
  const setDictationDraft = useStore((s) => s.setDictationDraft);
  const place = useStore((s) => s.manuscriptPlace[book.id]);
  const setManuscriptPlace = useStore((s) => s.setManuscriptPlace);
  const insertManuscriptStructure = useStore((s) => s.insertManuscriptStructure);
  const insertManuscriptImage = useStore((s) => s.insertManuscriptImage);
  const insertManuscriptTable = useStore((s) => s.insertManuscriptTable);
  const formatManuscript = useStore((s) => s.formatManuscript);
  const setManuscriptBlockKind = useStore((s) => s.setManuscriptBlockKind);
  const undoManuscript = useStore((s) => s.undoManuscript);
  const redoManuscript = useStore((s) => s.redoManuscript);
  const captureVoiceCommand = useStore((s) => s.captureVoiceCommand);
  const undoLastVoiceCommand = useStore((s) => s.undoLastVoiceCommand);
  const canUndo = useStore((s) => (s.manuscriptHistory[book.id]?.past.length ?? 0) > 0);
  const canRedo = useStore((s) => (s.manuscriptHistory[book.id]?.future.length ?? 0) > 0);
  const [outcome, setOutcome] = useState<DictationOutcome | null>(null);
  const [showProfile, setShowProfile] = useState(true);
  const [imageError, setImageError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoredBook = useRef<string | null>(null);
  const setDraft = useCallback((value: DictationDraft | ((prev: DictationDraft) => DictationDraft)) => {
    const prev = useStore.getState().dictationDrafts[book.id] ?? [];
    const next = typeof value === 'function' ? value(prev) : value;
    setDictationDraft(book.id, next);
  }, [book.id, setDictationDraft]);
  const genre = getGenre(book.genreId);
  const tense = getTense(book.tenseId);
  const perspective = getPerspective(book.perspectiveId);
  const stats = useMemo(() => manuscriptStats(book.manuscript), [book.manuscript]);
  const seriesNames = useMemo(() => mergeSeriesNameLibrary(books, book), [books, book]);

  const audioSettings = useStore((s) => s.audioSettings);
  const transcriptCaretRef = useRef<number | null>(null);
  const [boxCaret, setBoxCaret] = useState<number | null>(null);

  const handleFinal = useCallback(
    (text: string) => {
      const { text: cleaned, newCharacters } = cleanupDictationText(text, {
        entries: seriesNames,
        genre,
        tense: book.tenseId,
        perspective: book.perspectiveId,
        adaptive: book.adaptive,
      });
      if (newCharacters.length || containsStructureCue(cleaned)) captureVoiceCommand(book.id);
      for (const ch of newCharacters) {
        addNameEntry(book.id, {
          canonical: ch.canonical,
          category: 'character',
          aliases: ch.aliases,
          originBookId: book.id,
        });
      }
      if (!cleaned) return;
      const prev = useStore.getState().dictationDrafts[book.id] ?? [];
      const at = transcriptCaretRef.current;
      const next = joinDraftAt(prev, cleaned, at);
      const caret = caretAfterJoin(prev, next, at);
      transcriptCaretRef.current = caret;
      setBoxCaret(caret);
      setDictationDraft(book.id, next);
    },
    [
      addNameEntry,
      book.adaptive,
      book.id,
      book.perspectiveId,
      book.tenseId,
      captureVoiceCommand,
      genre,
      seriesNames,
      setDictationDraft,
    ],
  );

  const appendCue = useCallback((cue: string) => {
    captureVoiceCommand(book.id);
    const prev = useStore.getState().dictationDrafts[book.id] ?? [];
    const at = transcriptCaretRef.current;
    const next = at == null ? appendCueText(prev, cue) : insertCueAt(prev, at, cue);
    const caret = caretAfterJoin(prev, next, at ?? draftText(prev).length);
    transcriptCaretRef.current = caret;
    setBoxCaret(caret);
    setDictationDraft(book.id, next);
  }, [book.id, captureVoiceCommand, setDictationDraft]);
  const handleProfile = useCallback(
    (profile: { label: string }) => {
      rememberSttProfile(profile.label);
      setShowProfile(true);
    },
    [rememberSttProfile],
  );
  const handleCommand = useCallback(
    (command: DictationCommand) => {
      if (command === 'undoLastCommand') {
        undoLastVoiceCommand(book.id);
        return;
      }
      if (command === 'strikeLastSentence') {
        captureVoiceCommand(book.id);
        setDraft(strikeLastSentence);
      }
    },
    [book.id, captureVoiceCommand, setDraft, undoLastVoiceCommand],
  );
  const speech = useSpeechRecognition(handleFinal, audioSettings, handleProfile, {
    mayDictate: license.mayDictate,
    onCommand: handleCommand,
  });
  const profileLabel = speech.profileLabel || savedProfileLabel;

  useEffect(() => {
    onListeningChange?.(speech.session === 'listening');
    return () => onListeningChange?.(false);
  }, [onListeningChange, speech.session]);

  useLayoutEffect(() => {
    if (restoredBook.current === book.id) return;
    const el = scrollRef.current;
    if (!el) return;
    restoredBook.current = book.id;
    const saved = useStore.getState().manuscriptPlace[book.id];
    const hasDraft = Boolean(draftText(useStore.getState().dictationDrafts[book.id] ?? []).trim());
    if (saved?.blockId) {
      const node = el.querySelector(`[data-block-id="${saved.blockId.replace(/"/g, '')}"]`);
      if (node instanceof HTMLElement) {
        node.scrollIntoView({ block: 'nearest' });
        const ta = node.querySelector('textarea');
        if (ta && !hasDraft && saved.selectionStart != null) {
          ta.focus();
          const start = saved.selectionStart;
          const end = saved.selectionEnd ?? start;
          try {
            ta.setSelectionRange(start, end);
          } catch {
            /* ignore */
          }
        }
        return;
      }
    }
    if (typeof saved?.scrollTop === 'number') el.scrollTop = saved.scrollTop;
  }, [book.id, book.manuscript.blocks.length]);

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

  const promoteToManuscript = useCallback(
    (dest?: ManuscriptInsertAt) => {
      const { transcript, remaining } = takeInsertTranscript(draft);
      if (!transcript) return;
      const blocks = book.manuscript.blocks;
      const target = dest ?? destFromPlace(blocks, place);
      const beforeLen = blocks.length;
      captureVoiceCommand(book.id);
      const result = applyDictation(book.id, transcript, target);
      const afterLen =
        useStore.getState().books.find((b) => b.id === book.id)?.manuscript.blocks.length ?? beforeLen;
      setManuscriptPlace(book.id, advanceInsertPlace(place, target, afterLen - beforeLen, afterLen));
      setOutcome(result);
      setDraft(remaining);
      transcriptCaretRef.current = 0;
      setBoxCaret(0);
    },
    [applyDictation, book.id, book.manuscript.blocks, captureVoiceCommand, draft, place, setDraft, setManuscriptPlace],
  );
  const insertIntoTranscript = useCallback((offset: number) => {
    transcriptCaretRef.current = offset;
    setBoxCaret(offset);
  }, []);
  const promoteAtManuscriptPlace = useCallback(() => {
    promoteToManuscript(destFromPlace(book.manuscript.blocks, place));
  }, [book.manuscript.blocks, place, promoteToManuscript]);
  const insert = () => promoteAtManuscriptPlace();
  const draftVisible = draftText(draft);
  const canInsertDictation = Boolean(takeInsertTranscript(draft).transcript);
  const focusedBlock = book.manuscript.blocks.find((b) => b.id === place?.blockId);
  const insertDest = destFromPlace(book.manuscript.blocks, place);

  useEffect(() => {
    if (!editorOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setEditorOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editorOpen, setEditorOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.altKey) return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.closest('.manuscript, .ms-toolbar, .ms-para-editor, .ms-editor-shell, .ms-editor-dictate, .dictate-card')) return;
      if (target.closest('.dictation-transcript, .dictate-console')) return;
      if (e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) redoManuscript(book.id);
      else undoManuscript(book.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [book.id, redoManuscript, undoManuscript]);

  const pickImage = useCallback(
    async (dest?: ManuscriptInsertAt) => {
      setImageError(null);
      const res = await openBytesFile({
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
        accept: IMAGE_ACCEPT,
      });
      if (!res.ok || !res.bytes) return;
      const ingested = await ingestManuscriptImage({
        bytes: res.bytes,
        mime: res.mime,
        name: res.path,
      });
      if (!ingested.ok) {
        setImageError(ingested.reason);
        return;
      }
      insertManuscriptImage(book.id, ingested.image, dest ?? insertDest);
    },
    [book.id, insertDest, insertManuscriptImage],
  );

  const onInsertStructure = (kind: ManuscriptInsertKind) => {
    insertManuscriptStructure(book.id, kind, insertDest);
  };

  const onFormat = (kind: InlineMarkKind) => {
    if (!focusedBlock || focusedBlock.type !== 'paragraph') return;
    formatManuscript(
      book.id,
      focusedBlock.id,
      { start: place?.selectionStart ?? 0, end: place?.selectionEnd ?? place?.selectionStart ?? 0 },
      { type: 'toggle', kind },
    );
  };

  const onClearFormat = () => {
    if (!focusedBlock || focusedBlock.type !== 'paragraph') return;
    formatManuscript(
      book.id,
      focusedBlock.id,
      { start: place?.selectionStart ?? 0, end: place?.selectionEnd ?? place?.selectionStart ?? 0 },
      { type: 'clear' },
    );
  };

  const onSetKind = (kind: StructureHeadingKind) => {
    if (!focusedBlock) return;
    setManuscriptBlockKind(book.id, focusedBlock.id, kind);
  };

  const toolbar = (
    <ManuscriptToolbar
      focused={focusedBlock}
      canUndo={canUndo}
      canRedo={canRedo}
      editorOpen={editorOpen}
      onToggleEditor={() => setEditorOpen(!editorOpen)}
      onInsertStructure={onInsertStructure}
      onInsertImage={() => void pickImage()}
      onInsertTable={(rows, cols) => insertManuscriptTable(book.id, rows, cols, insertDest)}
      onFormat={onFormat}
      onClearFormat={onClearFormat}
      onSetKind={onSetKind}
      onUndo={() => undoManuscript(book.id)}
      onRedo={() => redoManuscript(book.id)}
    />
  );

  const manuscriptScroll = (
    <div
      className="dictate-ms-scroll"
      ref={scrollRef}
      onScroll={(e) => {
        const scrollTop = e.currentTarget.scrollTop;
        const prev = useStore.getState().manuscriptPlace[book.id];
        setManuscriptPlace(book.id, { ...prev, scrollTop });
      }}
    >
      <ManuscriptView
        book={book}
        place={place}
        canInsertDictation={canInsertDictation}
        onInsertDictation={promoteToManuscript}
        onPickImage={(dest) => void pickImage(dest)}
        onPlaceChange={(next) => {
          const scrollTop = scrollRef.current?.scrollTop ?? next.scrollTop;
          setManuscriptPlace(book.id, { ...next, scrollTop });
        }}
      />
    </div>
  );

  if (editorOpen) {
    return (
      <div className="dictate-page is-ms-editor">
        <div className="ms-editor-shell">
          <SplitPane
            ratio={manuscriptSplit}
            onRatioChange={setManuscriptSplit}
            minRatio={MANUSCRIPT_SPLIT_MIN}
            maxRatio={MANUSCRIPT_SPLIT_MAX}
            minPx={MANUSCRIPT_SPLIT_MIN_PX}
            resetRatio={MANUSCRIPT_SPLIT_DEFAULT}
            pinMid={false}
            aria-label="Resize manuscript tools and canvas"
            left={
              <div className="ms-editor-rail">
                <div className="ms-editor-head">
                  <h2>{book.title}</h2>
                </div>
                <ManuscriptToolbar
                  focused={focusedBlock}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  editorOpen={editorOpen}
                  layout="rail"
                  onToggleEditor={() => setEditorOpen(!editorOpen)}
                  onInsertStructure={onInsertStructure}
                  onInsertImage={() => void pickImage()}
                  onInsertTable={(rows, cols) => insertManuscriptTable(book.id, rows, cols, insertDest)}
                  onFormat={onFormat}
                  onClearFormat={onClearFormat}
                  onSetKind={onSetKind}
                  onUndo={() => undoManuscript(book.id)}
                  onRedo={() => redoManuscript(book.id)}
                />
                <EditorDictationStrip
                  speech={speech}
                  mayDictate={license.mayDictate}
                  draft={draft}
                  onChange={setDraft}
                  caret={boxCaret}
                  onCaretChange={(offset) => {
                    transcriptCaretRef.current = offset;
                    setBoxCaret(offset);
                  }}
                  canInsert={canInsertDictation}
                  onInsert={promoteAtManuscriptPlace}
                  onInsertIntoBox={insertIntoTranscript}
                  onStrikeLast={() => {
                    captureVoiceCommand(book.id);
                    setDraft(strikeLastSentence);
                  }}
                />
                {imageError && (
                  <div className="hint" style={{ color: 'var(--warn)' }}>
                    {imageError}
                  </div>
                )}
              </div>
            }
            right={<div className="ms-editor-canvas">{manuscriptScroll}</div>}
          />
        </div>
      </div>
    );
  }

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

      <div className="grid cols-4 dictate-stats">
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
          <div className="n">{seriesNames.length}</div>
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

          <div className="row dictate-mic">
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
              <div className="hint dictate-keys">
                Say <span className="kbd">start dictation</span> <span className="kbd">pause dictation</span>{' '}
                <span className="kbd">stop dictation</span> <span className="kbd">strike last sentence</span>{' '}
                <span className="kbd">undo last command</span>
              </div>
              <div className="hint dictate-keys">
                Say <span className="kbd">new character</span> then the name twice to train it. That cue
                does not go into the transcription box or the manuscript.
              </div>
              <div className="hint dictate-keys">
                Click a space between chapters, scenes, or paragraphs to choose where dictation
                lands. The same spots you can drop a dragged block. With none chosen, insert goes
                at the end.
              </div>
              <div className="hint dictate-keys">
                While listening: <span className="kbd">Space</span> new paragraph ·{' '}
                <span className="kbd">Enter</span> new chapter · <span className="kbd">Shift+Space</span> new
                scene · <span className="kbd">Shift+Enter</span> new section. The next sentence is the
                title. Editing the dictation box: <span className="kbd">⌘Enter</span> new chapter.
              </div>
              <div className="audio-meter" aria-hidden="true">
                <span style={{ width: `${speech.session !== 'stopped' || speech.level > 1 ? Math.max(4, speech.level) : 0}%` }} />
              </div>
              {speech.error && <div style={{ color: 'var(--warn)' }}>Mic: {speech.error}</div>}
            </div>
          </div>

          <AudioSettingsPanel />

          <div className="field">
            <label htmlFor="dictation-transcription">Transcription</label>
            <DictationTranscript
              id="dictation-transcription"
              value={draft}
              onChange={setDraft}
              placeholder="e.g. new chapter kel dros drew sun spar period"
              caret={boxCaret}
              canPromoteToManuscript={canInsertDictation}
              onCaretChange={(offset) => {
                transcriptCaretRef.current = offset;
                setBoxCaret(offset);
              }}
              onInsertDictation={insertIntoTranscript}
              onPromoteToManuscript={promoteAtManuscriptPlace}
            />
          </div>

          <div className="row wrap dictate-chips">
            {DICTATION_COMMAND_CHIPS.map((c) => (
              <button
                key={c}
                className="badge"
                style={{ cursor: 'pointer' }}
                onClick={() => appendCue(c)}
              >
                + {c}
              </button>
            ))}
            <button
              type="button"
              className="badge"
              style={{ cursor: 'pointer' }}
              title="Mark the last sentence in the dictation box as struck. Struck text stays visible and is omitted on insert."
              onClick={() => {
                captureVoiceCommand(book.id);
                setDraft(strikeLastSentence);
              }}
            >
              strike last sentence
            </button>
          </div>

          <div className="row dictate-insert">
            <button className="btn ghost" onClick={() => setDraft(plainDraft(SAMPLE))}>
              Load sample
            </button>
            <div className="row">
              <button className="btn ghost" onClick={() => setDraft([])} disabled={!draftVisible}>
                Clear
              </button>
              <button
                className="btn primary"
                onClick={insert}
                disabled={!canInsertDictation}
                title={
                  insertDest.splitOffset != null && insertDest.atBlockId
                    ? 'Inserts at the caret in the selected paragraph'
                    : (insertDest.atIndex ?? 0) >= book.manuscript.blocks.length
                      ? 'Inserts at the end of the manuscript'
                      : 'Inserts at the Dictation inserts here marker'
                }
              >
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
          <div className="ms-card-head">
            <div>
              <h3>Manuscript</h3>
              <p className="sub">Everything below is editable. Structure was created from your spoken cues.</p>
            </div>
          </div>
          {toolbar}
          {imageError && (
            <div className="hint" style={{ color: 'var(--warn)', margin: '4px 0 8px' }}>
              {imageError}
            </div>
          )}
          {manuscriptScroll}
        </div>
        }
      />
    </div>
  );
}
