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
  const idleLabel = compact ? RECORD_VOICE_ONLY_LABEL : 'Record';
  const stopLabel = compact ? 'Stop voice-only' : 'Stop';
  return (
    <div className={`row wrap record-voice-only-controls${compact ? ' is-compact' : ''}`}>
      <button
        type="button"
        className={`btn ${recording ? 'danger' : compact ? 'ghost' : 'primary'} desktop-record-btn`}
        disabled={disabled && !recording}
        onClick={onToggle}
        aria-pressed={recording}
        aria-label={recording ? 'Stop recording' : RECORD_VOICE_ONLY_LABEL}
      >
        <MicToggleFace recording={recording} className="desktop-record-mic" />
        {recording ? stopLabel : idleLabel}
      </button>
      {recording ? (
        <span className="hint desktop-record-meter" aria-live="polite">
          Recording {formatVoiceOnlyElapsed(elapsedMs)}
          <span
            className="desktop-record-level"
            style={{ ['--level' as string]: `${Math.min(100, level)}%` }}
          />
        </span>
      ) : compact ? null : (
        <span className="hint">Voice only — transcribe when you import the take.</span>
      )}
    </div>
  );
}
