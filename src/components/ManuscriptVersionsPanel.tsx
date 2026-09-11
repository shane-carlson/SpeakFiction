import { useEffect, useRef } from 'react';
import type { Block } from '../core/types';
import {
  formatRecoveryWhen,
  recoveryReasonLabel,
  type RecoveryPointMeta,
} from '../core/manuscriptVersions';
import { manuscriptVersionRecorder } from '../core/manuscriptVersionsLive';
import { useManuscriptVersions } from '../hooks/useManuscriptVersions';
import { useStore } from '../store';
import { ManuscriptVersionPreview } from './ManuscriptVersionPreview';

export function ManuscriptVersionsPanel({
  open,
  bookId,
  currentBlocks,
  onClose,
}: {
  open: boolean;
  bookId: string;
  currentBlocks: Block[];
  onClose: () => void;
}) {
  const restoreManuscriptBlocks = useStore((s) => s.restoreManuscriptBlocks);
  const { points, preview, loading, refresh, openPreview, setPreview } = useManuscriptVersions(
    bookId,
    currentBlocks,
  );
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    void refresh();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, refresh]);

  useEffect(() => {
    if (!open) setPreview(null);
  }, [open, setPreview]);

  if (!open) return null;

  const restore = async (point: RecoveryPointMeta) => {
    const ok = window.confirm(
      'Replace the current manuscript with this version? Your current pages are saved as a recovery point first.',
    );
    if (!ok) return;
    const recorder = manuscriptVersionRecorder();
    await recorder.flush(bookId, currentBlocks);
    await recorder.capture(bookId, currentBlocks, 'restore');
    const full = preview?.id === point.id ? preview : await recorder.load(bookId, point.id);
    if (!full) return;
    restoreManuscriptBlocks(bookId, full.blocks);
    onClose();
  };

  return (
    <div className="whats-new-overlay" onClick={onClose} role="presentation">
      <div
        className="card ms-versions-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ms-versions-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="whats-new-head">
          <div>
            <h3 id="ms-versions-title">Manuscript versions</h3>
            <p className="sub">Recovery points saved as you dictate and edit. Review one, then restore it if you want it back.</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="btn ghost compact"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="ms-versions-body">
          <ul className="ms-versions-list">
            {points.length === 0 ? (
              <li className="hint">No recovery points yet. They appear after you write.</li>
            ) : (
              points.map((point) => {
                const selected = preview?.id === point.id;
                return (
                  <li key={point.id}>
                    <button
                      type="button"
                      className={`ms-versions-item${selected ? ' is-selected' : ''}`}
                      onClick={() => void openPreview(point.id)}
                    >
                      <span className="ms-versions-when">{formatRecoveryWhen(point.createdAt)}</span>
                      <span className="ms-versions-why">{recoveryReasonLabel(point.reason)}</span>
                      <span className="hint">
                        {point.wordCount} {point.wordCount === 1 ? 'word' : 'words'}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <div className="ms-versions-preview" aria-live="polite">
            {loading ? (
              <p className="hint">Loading this version…</p>
            ) : preview ? (
              <>
                <div className="ms-versions-preview-head">
                  <div>
                    <strong>{recoveryReasonLabel(preview.reason)}</strong>
                    <p className="hint">{formatRecoveryWhen(preview.createdAt)}</p>
                  </div>
                  <button type="button" className="btn compact" onClick={() => void restore(preview)}>
                    Restore this version
                  </button>
                </div>
                <ManuscriptVersionPreview blocks={preview.blocks} />
              </>
            ) : (
              <p className="hint">Choose a recovery point to read that version of the manuscript.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
