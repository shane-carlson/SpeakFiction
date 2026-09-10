import { MicToggleFace } from './MicIcon';
import { RECORD_VOICE_ONLY_LABEL } from '../core/voiceNotes';

export function formatVoiceOnlyElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function RecordVoiceOnlyControls({
  recording,
  elapsedMs,
  level,
  disabled,
  compact,
  onToggle,
}: {
  recording: boolean;
  elapsedMs: number;
  level: number;
  disabled?: boolean;
  compact?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`record-voice-only-controls${compact ? ' is-compact' : ''}`}>
      <button
        type="button"
        className={`btn compact desktop-record-btn${recording ? ' is-recording' : ''}`}
        disabled={disabled && !recording}
        onClick={onToggle}
        aria-pressed={recording}
        aria-label={recording ? 'Stop recording' : RECORD_VOICE_ONLY_LABEL}
        title={
          recording
            ? 'Stop this voice-only take'
            : 'Save audio without transcribing into the box'
        }
      >
        <MicToggleFace recording={recording} className="desktop-record-mic" />
        <span className="desktop-record-label">
          {recording ? 'Stop' : compact ? RECORD_VOICE_ONLY_LABEL : 'Record'}
        </span>
      </button>
      {recording ? (
        <span className="hint desktop-record-meter" aria-live="polite">
          {formatVoiceOnlyElapsed(elapsedMs)}
          <span
            className="desktop-record-level"
            style={{ ['--level' as string]: `${Math.min(100, level)}%` }}
          />
        </span>
      ) : compact ? null : (
        <span className="hint">Transcribe when you import the take.</span>
      )}
    </div>
  );
}
