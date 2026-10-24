import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { headingLabels } from '../../hm/manuscript';

export function HeadingRemoveControl({
  kind,
  onUnwrap,
  onDelete,
}: {
  kind: 'chapter' | 'scene' | 'section';
  onUnwrap: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const pinned = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const labels = headingLabels(kind);

  const close = () => {
    pinned.current = false;
    setOpen(false);
  };

  const contains = (node: Node | null) =>
    Boolean(node && (rootRef.current?.contains(node) || menuRef.current?.contains(node)));

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 220;
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      setBox({ top: rect.bottom - 2, left });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointer = (event: PointerEvent) => {
      if (!contains(event.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`ms-chapter-remove${open ? ' is-open' : ''}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={(event) => {
        if (pinned.current || contains(event.relatedTarget as Node)) return;
        setOpen(false);
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        ref={buttonRef}
        type="button"
        className="btn ghost ms-block-remove"
        aria-label={labels.aria}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${labels.unwrap} or ${labels.delete.toLowerCase()}`}
        onMouseDown={() => {
          pinned.current = true;
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close();
        }}
      >
        ✕
      </button>
      {open && box && createPortal(
        <div
          ref={menuRef}
          className="ms-chapter-remove-flyout"
          role="menu"
          aria-label={labels.aria}
          style={{ position: 'fixed', top: box.top, left: box.left, right: 'auto', zIndex: 80 }}
          onMouseDown={(event) => event.stopPropagation()}
          onMouseEnter={() => setOpen(true)}
        >
          <button type="button" role="menuitem" onClick={() => { close(); onUnwrap(); }}>
            {labels.unwrap}
          </button>
          <button type="button" role="menuitem" onClick={() => { close(); onDelete(); }}>
            {labels.delete}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
