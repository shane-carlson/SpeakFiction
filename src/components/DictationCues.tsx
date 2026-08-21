import type { ReactNode } from 'react';

function CueRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dictate-cues-row">
      <div className="dictate-cues-label">{label}</div>
      <div className="dictate-cues-body">{children}</div>
    </div>
  );
}

export function DictationCues({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <div className={`dictate-cues${open ? ' is-open' : ''}`}>
      <div className="dictate-cues-head">
        <span className="dictate-cues-title">Cues</span>
        <button
          type="button"
          className="btn ghost compact dictate-cues-toggle"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          aria-controls="dictate-cues-list"
        >
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {open && (
        <div id="dictate-cues-list" className="dictate-cues-list">
          <CueRow label="Say">
            <span className="kbd">start dictation</span>
            <span className="kbd">pause dictation</span>
            <span className="kbd">stop dictation</span>
            <span className="kbd">strike last sentence</span>
            <span className="kbd">undo last command</span>
          </CueRow>
          <CueRow label="Name">
            <span className="kbd">new character</span> then the name twice. Stays out of the
            transcription and manuscript.
          </CueRow>
          <CueRow label="Keys">
            <span className="kbd">Space</span> paragraph · <span className="kbd">Enter</span> chapter ·{' '}
            <span className="kbd">⇧Space</span> scene · <span className="kbd">⇧Enter</span> section.
            Next sentence is the title. In the box: <span className="kbd">⌘Enter</span> chapter.
          </CueRow>
          <CueRow label="Insert">
            Click Choose insertion point, then a gap. Right-click the marker to clear it. With none
            chosen, insert goes at the end.
          </CueRow>
        </div>
      )}
    </div>
  );
}
