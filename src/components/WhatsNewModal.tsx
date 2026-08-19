import { useEffect, useRef } from 'react';
import { parseReleaseNotes } from '../core/whatsNew';

export function WhatsNewModal({
  open,
  version,
  build,
  notes,
  onDismiss,
}: {
  open: boolean;
  version: string;
  build: string;
  notes: string;
  onDismiss: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const blocks = parseReleaseNotes(notes);

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

  const versionLabel = version ? `v${version.replace(/^v/i, '')}` : 'this version';
  const buildLabel = build && build !== '0' ? ` · build ${build}` : '';

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
            <p className="sub">
              {versionLabel}
              {buildLabel}
            </p>
          </div>
          <button type="button" className="btn ghost compact" onClick={onDismiss} aria-label="Close">
            ×
          </button>
        </div>
        <div id="whats-new-body" className="whats-new-body">
          {blocks.length === 0 ? (
            <p>This update is ready on your device. Your library and license are unchanged.</p>
          ) : (
            blocks.map((block, index) => {
              if (block.type === 'heading') {
                const Tag = block.level === 1 ? 'h3' : 'h4';
                return <Tag key={index}>{block.text}</Tag>;
              }
              if (block.type === 'list') {
                return (
                  <ul key={index}>
                    {block.items.map((item, itemIndex) => (
                      <li key={itemIndex}>{item}</li>
                    ))}
                  </ul>
                );
              }
              return <p key={index}>{block.text}</p>;
            })
          )}
        </div>
        <button ref={closeRef} type="button" className="btn primary whats-new-got-it" onClick={onDismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}
