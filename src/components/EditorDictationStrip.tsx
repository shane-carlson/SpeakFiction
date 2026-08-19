import { draftText, type DictationDraft } from '../core/dictationDraft';
import type { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { DictationTranscript } from './DictationTranscript';

export function EditorDictationStrip({
  speech,
  mayDictate,
  draft,
  onChange,
  caret,
  onCaretChange,
  canInsert,
  onInsert,
  onInsertIntoBox,
  onStrikeLast,
}: {
  speech: ReturnType<typeof useSpeechRecognition>;
  mayDictate: boolean;
  draft: DictationDraft;
  onChange: (next: DictationDraft) => void;
  caret?: number | null;
  onCaretChange?: (offset: number) => void;
  canInsert: boolean;
  onInsert: () => void;
  onInsertIntoBox: (offset: number) => void;
  onStrikeLast: () => void;
}) {
  const recording = speech.session === 'listening';
  const micLabel = !mayDictate
    ? 'License required to dictate'
    : !speech.supported
      ? 'Microphone unavailable'
      : recording
        ? 'Pause dictation'
        : 'Start dictation';
  const status =
    speech.modelProgress != null && speech.modelProgress < 100
      ? `${Math.round(speech.modelProgress)}%`
      : recording
        ? speech.transcribing
          ? 'Transcribing'
          : speech.interim || 'Listening'
        : speech.session === 'paused'
          ? 'Paused'
          : !mayDictate
            ? 'License required'
            : 'Ready';

  return (
    <div className="ms-editor-dictate">
      <div className="ms-editor-dictate-mic">
        <button
          type="button"
          className={`mic-btn compact ${recording ? 'recording' : ''} ${speech.session === 'paused' ? 'paused' : ''}`}
          onClick={() => (recording ? speech.pause() : void speech.start())}
          disabled={!speech.supported || !mayDictate}
          title={micLabel}
          aria-label={micLabel}
        >
          {recording ? '❚❚' : '🎙️'}
        </button>
        <button
          type="button"
          className="btn ghost compact"
          onClick={() => speech.stop()}
          disabled={!speech.supported || speech.session === 'stopped'}
        >
          Stop
        </button>
        <div className="ms-editor-dictate-status" role="status">
          <span>{status}</span>
          <div className="audio-meter" aria-hidden="true">
            <span
              style={{
                width: `${speech.session !== 'stopped' || speech.level > 1 ? Math.max(4, speech.level) : 0}%`,
              }}
            />
          </div>
          {speech.error && <div className="ms-editor-dictate-error">{speech.error}</div>}
        </div>
      </div>
      <DictationTranscript
        id="editor-dictation-transcription"
        className="is-compact"
        value={draft}
        onChange={onChange}
        caret={caret}
        canPromoteToManuscript={canInsert}
        onCaretChange={onCaretChange}
        onInsertDictation={onInsertIntoBox}
        onPromoteToManuscript={onInsert}
      />
      <div className="ms-editor-dictate-actions">
        <button
          type="button"
          className="btn ghost compact"
          onClick={onStrikeLast}
          disabled={!draftText(draft).trim()}
          title="Strike last sentence"
        >
          Strike
        </button>
        <button
          type="button"
          className="btn primary compact"
          onClick={onInsert}
          disabled={!canInsert}
          title="Insert into manuscript"
        >
          Insert
        </button>
      </div>
    </div>
  );
}
