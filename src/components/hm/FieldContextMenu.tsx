import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { placeContextMenu } from '../../hm/contextMenu';

export interface ContextMenuState {
  x: number;
  y: number;
  hasSelection: boolean;
  suggestions: string[];
  /** Plain word the suggestions would replace, for the button name only. */
  misspelledWord: string | null;
}

/** Click point tracked against a live caret range so scroll moves the anchor with the word. */
export interface MenuAnchor {
  range: Range;
  dx: number;
  dy: number;
}

export function FieldContextMenu({
  state,
  anchorRef,
  onClose,
  onCut,
  onCopy,
  onPaste,
  onSelectAll,
  onInsertTable,
  onInsertImage,
  onInsertPageBreak,
  onInsertDivider,
  onInsertBlockquote,
  onReplaceWord,
}: {
  state: ContextMenuState | null;
  anchorRef: RefObject<MenuAnchor | null>;
  onClose: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onSelectAll: () => void;
  onInsertTable: () => void;
  onInsertImage: () => void;
  onInsertPageBreak: () => void;
  onInsertDivider: () => void;
  onInsertBlockquote: () => void;
  onReplaceWord?: (word: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [state, onClose]);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!state || !menu) return;

    const place = () => {
      const tracked = anchorRef.current;
      let x = state.x;
      let y = state.y;
      if (tracked && tracked.range.startContainer.isConnected) {
        const rect = tracked.range.getBoundingClientRect();
        x = rect.left + tracked.dx;
        y = rect.top + tracked.dy;
      }
      menu.style.maxHeight = 'none';
      menu.style.maxWidth = 'none';
      const next = placeContextMenu({
        anchorX: x,
        anchorY: y,
        menuWidth: menu.offsetWidth,
        menuHeight: menu.scrollHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      menu.style.top = `${next.top}px`;
      menu.style.left = `${next.left}px`;
      menu.style.maxHeight = `${next.maxHeight}px`;
      menu.style.maxWidth = `${next.maxWidth}px`;
      menu.style.visibility = 'visible';
    };

    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [state, anchorRef]);

  if (!state) return null;

  const suggestions = state.suggestions;

  return createPortal(
    <div
      ref={ref}
      className="field-context-menu"
      style={{ top: 0, left: 0, visibility: 'hidden' }}
      role="menu"
      onMouseDown={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {suggestions.length > 0 && (
        <>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              role="menuitem"
              className="field-context-menu__suggestion"
              data-spell-suggestion={suggestion}
              aria-label={
                state.misspelledWord
                  ? `Replace “${state.misspelledWord}” with “${suggestion}”`
                  : `Replace with “${suggestion}”`
              }
              onClick={() => {
                onReplaceWord?.(suggestion);
                onClose();
              }}
            >
              {suggestion}
            </button>
          ))}
          <div className="field-context-menu__sep" />
        </>
      )}
      {state.hasSelection && (
        <>
          <button type="button" role="menuitem" onClick={() => { onCut(); onClose(); }}>Cut</button>
          <button type="button" role="menuitem" onClick={() => { onCopy(); onClose(); }}>Copy</button>
        </>
      )}
      <button type="button" role="menuitem" onClick={() => { onPaste(); onClose(); }}>Paste</button>
      <button type="button" role="menuitem" onClick={() => { onSelectAll(); onClose(); }}>Select all</button>
      <div className="field-context-menu__sep" />
      <button type="button" role="menuitem" onClick={() => { onInsertPageBreak(); onClose(); }}>Insert page break</button>
      <button type="button" role="menuitem" onClick={() => { onInsertDivider(); onClose(); }}>Insert scene break</button>
      <button type="button" role="menuitem" onClick={() => { onInsertBlockquote(); onClose(); }}>Insert block quote</button>
      <button type="button" role="menuitem" onClick={() => { onInsertTable(); onClose(); }}>Insert table…</button>
      <button type="button" role="menuitem" onClick={() => { onInsertImage(); onClose(); }}>Insert image…</button>
    </div>,
    document.body,
  );
}
