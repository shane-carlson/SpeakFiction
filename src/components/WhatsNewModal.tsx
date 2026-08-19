import { useEffect, useRef } from 'react';
import { DEFAULT_WHATS_NEW, featureBullets, marketingVersion } from '../core/whatsNew';

export function WhatsNewModal({
  open,
  version,
  notes,
  onDismiss,
}: {
  open: boolean;
  version: string;
  build?: string;
  notes: string;
  onDismiss: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const bullets = featureBullets(notes);
  const items = bullets.length ? bullets : featureBullets(DEFAULT_WHATS_NEW);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onDismiss]);

  if (!open) return null;

  const marketing = marketingVersion(version);
  const versionLabel = marketing ? `Version ${marketing}` : 'this version';

  return (
    <div className="whats-new-overlay" onClick={onDismiss} role="presentation">
      <div
        className="card whats-new-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        aria-describedby="whats-new-body"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="whats-new-head">
          <div>
            <h3 id="whats-new-title">What’s new</h3>
            <p className="sub">{versionLabel}</p>
          </div>
          <button type="button" className="btn ghost compact" onClick={onDismiss} aria-label="Close">
            ×
          </button>
        </div>
        <div id="whats-new-body" className="whats-new-body">
          <ul>
            {items.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
        <button ref={closeRef} type="button" className="btn primary whats-new-got-it" onClick={onDismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}
