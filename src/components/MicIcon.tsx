import mic from '../assets/mic.png';

const warm = new Image();
warm.src = mic;

/** Same studio-mic image as the companion record button. */
export function MicIcon({ className, hidden }: { className?: string; hidden?: boolean }) {
  return (
    <img
      className={className}
      src={mic}
      alt=""
      draggable={false}
      decoding="sync"
      fetchPriority="high"
      style={hidden ? { visibility: 'hidden', position: 'absolute' } : undefined}
    />
  );
}

export function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
      <rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    </svg>
  );
}

/** Keeps the PNG mounted so record/pause does not decode it again. */
export function MicToggleFace({ recording, className }: { recording: boolean; className?: string }) {
  return (
    <span className={className} style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%' }}>
      <MicIcon hidden={recording} />
      {recording ? <PauseIcon /> : null}
    </span>
  );
}
