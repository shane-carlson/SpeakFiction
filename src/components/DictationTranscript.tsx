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
  offsetsFromDomRange,
  serializeDraft,
  type DictationDraft,
} from '../core/dictationDraft';
import { AppContextMenu } from './AppContextMenu';

function placeCaretAtEnd(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

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
  canInsertDictation,
  onInsertDictation,
}: {
  id: string;
  value: DictationDraft;
  onChange: (next: DictationDraft) => void;
  placeholder?: string;
  canInsertDictation?: boolean;
  onInsertDictation?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastSerialized = useRef<string | null>(null);
  const empty = serializeDraft(value) === '[]';
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    start: number;
    end: number;
  } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const serialized = serializeDraft(value);
    if (serialized === lastSerialized.current) return;
    el.innerHTML = draftToHtml(value);
    lastSerialized.current = serialized;
    if (document.activeElement === el) placeCaretAtEnd(el);
  }, [value]);

  const closeMenu = useCallback(() => setMenu(null), []);

  const items: DictationMenuItem[] = menu
    ? buildDictationContextMenu({
        hasSelection: menu.start !== menu.end,
        selectionStruck: menuSelectionStruck(value, menu),
        canInsertDictation,
      })
    : [];

  return (
    <>
      <div
        ref={ref}
        id={id}
        className={`dictation-transcript${empty ? ' is-empty' : ''}`}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        suppressContentEditableWarning
        spellCheck
        onInput={() => {
          const el = ref.current;
          if (!el) return;
          const next = draftFromElement(el);
          lastSerialized.current = serializeDraft(next);
          onChange(next);
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          if (!text) return;
          document.execCommand('insertText', false, text);
        }}
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

          const offsets = range ? offsetsFromDomRange(el, range) : { start: 0, end: 0 };

          setMenu({
            x: e.clientX,
            y: e.clientY,
            start: offsets.start,
            end: offsets.end,
          });
        }}
      />
      {menu && (
        <AppContextMenu
          x={menu.x}
          y={menu.y}
          items={items}
          onClose={closeMenu}
          onSelect={(id) => {
            const item = items.find((it) => it.id === id);
            if (!item) return;
            if (item.action.type === 'insertDictation') {
              onInsertDictation?.();
              return;
            }
            onChange(applyDictationMenuAction(value, item.action, menu));
          }}
        />
      )}
    </>
  );
}
