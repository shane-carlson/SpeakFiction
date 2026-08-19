import { useLayoutEffect, useRef } from 'react';
import type { InlineMark } from '../core/types';
import { htmlToMarkedText, textToHtml } from '../core/richText';
import { offsetsFromDomRange, setDomCaretFromOffset } from '../core/dictationDraft';

function marksKey(marks: InlineMark[] | undefined): string {
  return (marks ?? []).map((m) => `${m.kind}:${m.start}-${m.end}`).join(',');
}

export function RichParagraph({
  value,
  marks,
  onChange,
  onPlace,
  onModKey,
}: {
  value: string;
  marks?: InlineMark[];
  onChange: (text: string, marks: InlineMark[]) => void;
  onPlace: (selStart: number, selEnd: number) => void;
  onModKey?: (key: 'b' | 'i' | 'u') => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef({ value: '\u0000', key: '' });
  const focused = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const key = marksKey(marks);
    if (last.current.value === value && last.current.key === key) return;
    last.current = { value, key };
    const html = textToHtml(value, marks);
    if (el.innerHTML === html) return;
    let end = 0;
    if (focused.current && document.activeElement === el) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        end = offsetsFromDomRange(el, sel.getRangeAt(0)).end;
      }
    }
    el.innerHTML = html || '';
    if (focused.current && document.activeElement === el) {
      try {
        setDomCaretFromOffset(el, end);
      } catch {
        /* ignore */
      }
    }
  }, [value, marks]);

  const reportSelection = () => {
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
      onPlace(value.length, value.length);
      return;
    }
    const { start, end } = offsetsFromDomRange(el, sel.getRangeAt(0));
    onPlace(start, end);
  };

  return (
    <div
      ref={ref}
      className="ms-para-editor"
      contentEditable
      role="textbox"
      aria-multiline="true"
      spellCheck={true}
      suppressContentEditableWarning
      onInput={() => {
        const el = ref.current;
        if (!el) return;
        const next = htmlToMarkedText(el);
        last.current = { value: next.text, key: marksKey(next.marks) };
        onChange(next.text, next.marks);
        reportSelection();
      }}
      onSelect={reportSelection}
      onKeyUp={reportSelection}
      onMouseUp={reportSelection}
      onFocus={() => {
        focused.current = true;
        reportSelection();
      }}
      onBlur={() => {
        focused.current = false;
      }}
      onKeyDown={(e) => {
        const meta = e.metaKey || e.ctrlKey;
        if (!meta || e.altKey) return;
        const key = e.key.toLowerCase();
        if (key === 'b' || key === 'i' || key === 'u') {
          e.preventDefault();
          onModKey?.(key);
        }
      }}
    />
  );
}
