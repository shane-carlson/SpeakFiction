import { useLayoutEffect, useRef } from 'react';
import {
  draftFromElement,
  draftToHtml,
  serializeDraft,
  type DictationDraft,
} from '../core/dictationDraft';

function placeCaretAtEnd(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

export function DictationTranscript({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: DictationDraft;
  onChange: (next: DictationDraft) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastSerialized = useRef<string | null>(null);
  const empty = serializeDraft(value) === '[]';

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const serialized = serializeDraft(value);
    if (serialized === lastSerialized.current) return;
    el.innerHTML = draftToHtml(value);
    lastSerialized.current = serialized;
    if (document.activeElement === el) placeCaretAtEnd(el);
  }, [value]);

  return (
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
    />
  );
}
