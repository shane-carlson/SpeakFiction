import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  applyDictationMenuAction,
  buildDictationContextMenu,
  menuSelectionStruck,
  type DictationMenuItem,
} from '../core/dictationContextMenu';
import {
  draftFromElement,
  draftToHtml,
  isTranscriptInsertAtEnd,
  offsetsFromDomRange,
  rangeAtDraftOffset,
  serializeDraft,
  setDomCaretFromOffset,
  type DictationDraft,
} from '../core/dictationDraft';
import { AppContextMenu } from './AppContextMenu';

export const TRANSCRIPT_INSERT_HINT = 'Transcription will be inserted here';

function rangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof doc.caretRangeFromPoint === 'function') {
    return doc.caretRangeFromPoint(x, y);
  }
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (!pos) return null;
  const range = document.createRange();
  range.setStart(pos.offsetNode, pos.offset);
  range.collapse(true);
  return range;
}

function rangeInside(el: HTMLElement, range: Range | null): range is Range {
  if (!range) return false;
  const node = range.commonAncestorContainer;
  return node === el || el.contains(node);
}

export function DictationTranscript({
  id,
  value,
  onChange,
  placeholder,
  caret,
  canPromoteToManuscript,
  onCaretChange,
  onInsertDictation,
  onPromoteToManuscript,
  className,
}: {
  id: string;
  value: DictationDraft;
  onChange: (next: DictationDraft) => void;
  placeholder?: string;
  caret?: number | null;
  canPromoteToManuscript?: boolean;
  onCaretChange?: (offset: number) => void;
  onInsertDictation?: (offset: number) => void;
  onPromoteToManuscript?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const lastSerialized = useRef<string | null>(null);
  const caretRef = useRef(caret ?? 0);
  const applyingRef = useRef(false);
  const empty = serializeDraft(value) === '[]';
  const insertAtEnd = isTranscriptInsertAtEnd(value, caret);
  const [hovering, setHovering] = useState(false);
  const [pin, setPin] = useState<{ top: number; left: number; height: number } | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    start: number;
    end: number;
  } | null>(null);

  if (typeof caret === 'number') caretRef.current = caret;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const serialized = serializeDraft(value);
    if (serialized === lastSerialized.current) return;
    const restore = caretRef.current;
    applyingRef.current = true;
    el.innerHTML = draftToHtml(value);
    lastSerialized.current = serialized;
    caretRef.current = restore;
    if (document.activeElement === el) setDomCaretFromOffset(el, restore);
    queueMicrotask(() => {
      applyingRef.current = false;
    });
  }, [value]);

  useLayoutEffect(() => {
    const el = ref.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;

    const measure = () => {
      if (isTranscriptInsertAtEnd(value, caret)) {
        setPin(null);
        return;
      }
      const offset = typeof caret === 'number' ? caret : caretRef.current;
      const range = rangeAtDraftOffset(el, offset);
      const caretBox =
        typeof range.getBoundingClientRect === 'function'
          ? range.getBoundingClientRect()
          : new DOMRect(0, 0, 0, 0);
      const wrapBox = wrap.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const line = Number.parseFloat(cs.lineHeight) || Number.parseFloat(cs.fontSize) * 1.45 || 18;
      const height = caretBox.height > 1 ? caretBox.height : line;
      let top = caretBox.top - wrapBox.top;
      let left = caretBox.left - wrapBox.left;
      if (caretBox.height < 1 && caretBox.width < 1 && caretBox.top === 0 && caretBox.left === 0) {
        top = 8;
        left = 12;
      }
      setPin({ top, left, height });
    };

    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    ro?.observe(wrap);
    el.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [value, caret]);

  const reportCaret = useCallback(
    (offset: number) => {
      caretRef.current = offset;
      onCaretChange?.(offset);
    },
    [onCaretChange],
  );

  const readCaret = useCallback(() => {
    if (applyingRef.current) return;
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !rangeInside(el, sel.getRangeAt(0))) return;
    const { start, end } = offsetsFromDomRange(el, sel.getRangeAt(0));
    reportCaret(sel.isCollapsed ? start : end);
  }, [reportCaret]);

  const closeMenu = useCallback(() => setMenu(null), []);

  const items: DictationMenuItem[] = menu
    ? buildDictationContextMenu({
        hasSelection: menu.start !== menu.end,
        selectionStruck: menuSelectionStruck(value, menu),
        canPromoteToManuscript,
      })
    : [];

  const showHint = hovering && !insertAtEnd && pin;

  return (
    <>
      <div
        ref={wrapRef}
        className="dictation-transcript-wrap"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <div
          ref={ref}
          id={id}
          className={`dictation-transcript${empty ? ' is-empty' : ''}${className ? ` ${className}` : ''}`}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-describedby={insertAtEnd ? undefined : `${id}-insert-pin`}
          data-placeholder={placeholder}
          suppressContentEditableWarning
          spellCheck={true}
          onInput={() => {
            const el = ref.current;
            if (!el) return;
            const next = draftFromElement(el);
            lastSerialized.current = serializeDraft(next);
            onChange(next);
            readCaret();
          }}
          onBlur={() => {
            const el = ref.current;
            if (!el) return;
            const next = draftFromElement(el);
            lastSerialized.current = serializeDraft(next);
            onChange(next);
            readCaret();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            if (!text) return;
            document.execCommand('insertText', false, text);
          }}
          onKeyUp={readCaret}
          onMouseUp={readCaret}
          onSelect={readCaret}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
              e.preventDefault();
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const el = ref.current;
            if (!el) return;

            const sel = window.getSelection();
            let range: Range | null =
              sel && sel.rangeCount > 0 && !sel.isCollapsed && rangeInside(el, sel.getRangeAt(0))
                ? sel.getRangeAt(0)
                : null;

            if (!range) {
              const pointed = rangeFromPoint(e.clientX, e.clientY);
              if (rangeInside(el, pointed)) {
                range = pointed;
                sel?.removeAllRanges();
                sel?.addRange(pointed);
              } else if (sel && sel.rangeCount > 0 && rangeInside(el, sel.getRangeAt(0))) {
                range = sel.getRangeAt(0);
              }
            }

            const offsets = range ? offsetsFromDomRange(el, range) : { start: caretRef.current, end: caretRef.current };
            reportCaret(offsets.start === offsets.end ? offsets.start : offsets.start);
            setMenu({
              x: e.clientX,
              y: e.clientY,
              start: offsets.start,
              end: offsets.end,
            });
          }}
        />
        {pin && !insertAtEnd && (
          <div
            id={`${id}-insert-pin`}
            className="dictation-insert-pin"
            role="note"
            aria-label={TRANSCRIPT_INSERT_HINT}
            style={{ top: pin.top, left: pin.left, height: pin.height }}
          >
            <span className="dictation-insert-pin-bar" aria-hidden="true" />
            {showHint && (
              <div
                className={`dictation-insert-hint card${pin.top < 36 ? ' is-below' : ''}`}
                role="tooltip"
              >
                {TRANSCRIPT_INSERT_HINT}
              </div>
            )}
          </div>
        )}
      </div>
      {menu && (
        <AppContextMenu
          x={menu.x}
          y={menu.y}
          items={items}
          onClose={closeMenu}
          onSelect={(id) => {
            const item = items.find((it) => it.id === id);
            if (!item) return;
            if (item.action.type === 'promoteToManuscript') {
              onPromoteToManuscript?.();
              return;
            }
            if (item.action.type === 'insertDictation') {
              // Snapshot caret so the menu click does not fall back to append-at-end.
              reportCaret(menu.start);
              onInsertDictation?.(menu.start);
              return;
            }
            onChange(applyDictationMenuAction(value, item.action, menu));
          }}
        />
      )}
    </>
  );
}
