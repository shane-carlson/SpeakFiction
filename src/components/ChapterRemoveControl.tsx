import { useState } from 'react';
import {
  CHAPTER_DELETE_ID,
  CHAPTER_UNWRAP_ID,
  applyHeadingMenuAction,
  headingLabels,
  type ManuscriptHeadingKind,
} from '../core/manuscriptContextMenu';

export function HeadingRemoveControl({
  kind,
  onUnwrap,
  onDelete,
}: {
  kind: ManuscriptHeadingKind;
  onUnwrap: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const labels = headingLabels(kind);

  const run = (id: string) => {
    applyHeadingMenuAction(id, {
      unwrapHeading: onUnwrap,
      deleteHeading: onDelete,
    });
    setOpen(false);
  };

  return (
    <div
      className={`ms-chapter-remove${open ? ' is-open' : ''}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="btn ghost ms-block-remove"
        aria-label={labels.aria}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${labels.unwrap} or ${labels.delete.toLowerCase()}`}
        onClick={() => setOpen((v) => !v)}
      >
        ✕
      </button>
      {open && (
        <div className="ms-chapter-remove-flyout card" role="menu" aria-label={labels.aria}>
          <button type="button" role="menuitem" className="btn ghost compact" onClick={() => run(CHAPTER_UNWRAP_ID)}>
            {labels.unwrap}
          </button>
          <button type="button" role="menuitem" className="btn ghost compact" onClick={() => run(CHAPTER_DELETE_ID)}>
            {labels.delete}
          </button>
        </div>
      )}
    </div>
  );
}

export function ChapterRemoveControl({
  onUnwrap,
  onDelete,
}: {
  onUnwrap: () => void;
  onDelete: () => void;
}) {
  return <HeadingRemoveControl kind="chapter" onUnwrap={onUnwrap} onDelete={onDelete} />;
}
