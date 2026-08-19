import { useState } from 'react';
import {
  CHAPTER_DELETE_ID,
  CHAPTER_DELETE_LABEL,
  CHAPTER_UNWRAP_ID,
  CHAPTER_UNWRAP_LABEL,
  applyChapterHeadingMenuAction,
} from '../core/manuscriptContextMenu';

export function ChapterRemoveControl({
  onUnwrap,
  onDelete,
}: {
  onUnwrap: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  const run = (id: string) => {
    applyChapterHeadingMenuAction(id, {
      unwrapHeading: onUnwrap,
      deleteChapter: onDelete,
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
        aria-label="Chapter remove options"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${CHAPTER_UNWRAP_LABEL} or ${CHAPTER_DELETE_LABEL.toLowerCase()}`}
        onClick={() => setOpen((v) => !v)}
      >
        ✕
      </button>
      {open && (
        <div className="ms-chapter-remove-flyout card" role="menu" aria-label="Chapter remove options">
          <button type="button" role="menuitem" className="btn ghost compact" onClick={() => run(CHAPTER_UNWRAP_ID)}>
            {CHAPTER_UNWRAP_LABEL}
          </button>
          <button type="button" role="menuitem" className="btn ghost compact" onClick={() => run(CHAPTER_DELETE_ID)}>
            {CHAPTER_DELETE_LABEL}
          </button>
        </div>
      )}
    </div>
  );
}
