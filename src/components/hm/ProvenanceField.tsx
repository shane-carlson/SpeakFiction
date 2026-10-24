import { useLayoutEffect, useRef, useState } from 'react';
import { offsetsFromDomRange, setDomCaretFromOffset } from '../../hm/domCaret';
import type { InputEvidence, InsertionOrigin, ProvenanceSpan } from '../../hm/certification';
import { classifyInsertion, MAX_KEYBOARD_INSERT_CHARS } from '../../hm/certification';
import { passageCardId } from '../../hm/passageCard';
import { describePasteSource } from '../../hm/pasteHint';
import type { InlineMark, InlineMarkKind, ListStyle } from '../../hm/types';
import { FieldContextMenu, type ContextMenuState, type MenuAnchor } from './FieldContextMenu';
import { collectSpellSuggestions, spellcheckReplacement, wordAroundOffset } from '../../hm/contextMenu';

export interface FieldCommit {
  start: number;
  end: number;
  insert: string;
  origin: InsertionOrigin | null;
  pasteHint?: string;
  event: InputEvidence | null;
  caret: number;
}

interface Piece {
  text: string;
  origin: ProvenanceSpan['origin'];
  spanId?: string;
  certificationId?: string;
  pasteHint?: string;
  marks: InlineMarkKind[];
  hit: boolean;
}

function pieces(
  text: string,
  spans: ProvenanceSpan[],
  marks: InlineMark[],
  highlight: { start: number; end: number } | null,
): Piece[] {
  if (!text) return [];
  const bounds = new Set<number>([0, text.length]);
  for (const span of spans) {
    bounds.add(Math.max(0, Math.min(span.start, text.length)));
    bounds.add(Math.max(0, Math.min(span.end, text.length)));
  }
  for (const mark of marks) {
    bounds.add(Math.max(0, Math.min(mark.start, text.length)));
    bounds.add(Math.max(0, Math.min(mark.end, text.length)));
  }
  if (highlight) {
    bounds.add(Math.max(0, Math.min(highlight.start, text.length)));
    bounds.add(Math.max(0, Math.min(highlight.end, text.length)));
  }
  const cuts = [...bounds].filter((n) => n >= 0 && n <= text.length).sort((a, b) => a - b);
  const out: Piece[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i]!;
    const end = cuts[i + 1]!;
    if (end <= start) continue;
    const span = spans.find((item) => item.start <= start && item.end >= end);
    out.push({
      text: text.slice(start, end),
      origin: span?.origin ?? 'other',
      spanId: span?.id,
      certificationId: span?.certificationId,
      pasteHint: span?.pasteHint,
      marks: marks.filter((mark) => mark.start <= start && mark.end >= end).map((mark) => mark.kind),
      hit: Boolean(highlight && highlight.start <= start && highlight.end >= end),
    });
  }
  return out;
}

function paint(root: HTMLElement, rendered: Piece[], showProvenance: boolean, blockId: string) {
  root.replaceChildren();
  const order: InlineMarkKind[] = ['bold', 'italic', 'underline', 'strike'];
  for (const piece of rendered) {
    const span = document.createElement('span');
    if (showProvenance) {
      span.className = `prov prov-${piece.origin}${piece.hit ? ' find-hit' : ''}`;
      span.dataset.origin = piece.origin;
      if (piece.certificationId) span.dataset.cert = piece.certificationId;
      const cardId = passageCardId(blockId, {
        id: piece.spanId || 'bare',
        origin: piece.origin,
        certificationId: piece.certificationId,
      });
      if (cardId) span.dataset.card = cardId;
      if (piece.pasteHint) span.title = piece.pasteHint;
    } else {
      span.className = piece.hit ? 'find-hit' : 'prov-plain';
    }
    let parent: Node = span;
    for (const kind of order) {
      if (!piece.marks.includes(kind)) continue;
      const tag = kind === 'bold' ? 'strong' : kind === 'italic' ? 'em' : kind === 'underline' ? 'u' : 's';
      const el = document.createElement(tag);
      parent.appendChild(el);
      parent = el;
    }
    parent.appendChild(document.createTextNode(piece.text));
    root.appendChild(span);
  }
}

function diff(before: string, after: string): { start: number; end: number; insert: string } {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let tail = 0;
  while (
    tail < before.length - start &&
    tail < after.length - start &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail += 1;
  }
  return { start, end: before.length - tail, insert: after.slice(start, after.length - tail) };
}

export function ProvenanceField({
  text,
  spans,
  marks = [],
  highlight = null,
  placeholder,
  className,
  ariaLabel,
  onCommit,
  onSplit,
  onMergeBackward,
  onSelect,
  onFormat,
  onInternalDrag,
  onInternalDrop,
  renderToken = 0,
  showProvenance = true,
  blockId = '',
  onCertificationHover,
  listStyle = null,
  indentLevel = 0,
  onInsertTable,
  onInsertImage,
  onInsertPageBreak,
  onInsertDivider,
  onInsertBlockquote,
}: {
  text: string;
  spans: ProvenanceSpan[];
  marks?: InlineMark[];
  highlight?: { start: number; end: number } | null;
  placeholder: string;
  className?: string;
  ariaLabel: string;
  onCommit: (commit: FieldCommit) => void;
  onSplit?: (offset: number) => void;
  onMergeBackward?: () => void;
  onSelect?: (start: number, end: number) => void;
  onFormat?: (kind: InlineMarkKind) => void;
  onInternalDrag?: (start: number, end: number) => void;
  onInternalDrop?: (offset: number) => void;
  /** Bumped for undo, redo, and other edits that did not originate in this field. */
  renderToken?: number;
  /** When false, show prose only (no origin underlines). */
  showProvenance?: boolean;
  /** Block that owns this field, used to link unsealed spans to pane cards. */
  blockId?: string;
  /** Highlight view only: the pane card for the span under the pointer, or null. */
  onCertificationHover?: (cardId: string | null) => void;
  listStyle?: ListStyle;
  indentLevel?: number;
  onInsertTable?: () => void;
  onInsertImage?: () => void;
  onInsertPageBreak?: () => void;
  onInsertDivider?: () => void;
  onInsertBlockquote?: () => void;
}) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const anchorRef = useRef<MenuAnchor | null>(null);
  const replaceRef = useRef<{ start: number; end: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const caret = useRef<number | null>(null);
  const skipPaste = useRef(false);
  const textRef = useRef(text);
  const pending = useRef<{ origin: InsertionOrigin | null; inputType: string; trusted: boolean } | null>(null);
  const lastKey = useRef<string | null>(null);
  const lastKeyAt = useRef<number | null>(null);
  const seenToken = useRef(renderToken);

  const signature = JSON.stringify({ text, spans, marks, highlight });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || composing.current) return;
    const dom = el.textContent ?? '';
    const external = seenToken.current !== renderToken;
    seenToken.current = renderToken;
    const typingAhead =
      !external && document.activeElement === el && textRef.current === dom && dom !== text && dom.startsWith(text);
    if (typingAhead) return;
    textRef.current = text;
    let nextCaret = caret.current;
    if (nextCaret == null && document.activeElement === el) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
        nextCaret = offsetsFromDomRange(el, sel.getRangeAt(0)).end;
      }
    }
    paint(el, pieces(text, spans, marks, highlight), showProvenance, blockId);
    if (nextCaret != null && document.activeElement === el) {
      try {
        setDomCaretFromOffset(el, nextCaret);
      } catch {
        /* The selection can sit on a detached node during a fast edit. */
      }
    }
    caret.current = null;
  }, [signature, text, spans, marks, highlight, renderToken, showProvenance, blockId]);

  const selection = () => {
    const el = ref.current;
    if (!el) return { start: textRef.current.length, end: textRef.current.length };
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
      return { start: textRef.current.length, end: textRef.current.length };
    }
    return offsetsFromDomRange(el, sel.getRangeAt(0));
  };

  const report = () => onSelect?.(selection().start, selection().end);

  return (
    <>
    <div
      ref={ref}
      className={`ms-field ${className ?? ''}${listStyle ? ` ms-list-${listStyle}` : ''}`}
      contentEditable
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      data-placeholder={placeholder}
      spellCheck
      suppressContentEditableWarning
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
        const el = ref.current;
        if (!el) return;
        const next = el.textContent ?? '';
        const change = diff(textRef.current, next);
        if (!change.insert && change.start === change.end) return;
        caret.current = change.start + change.insert.length;
        onCommit({
          ...change,
          origin: 'keyboard',
          event: {
            at: new Date().toISOString(),
            inputType: 'insertCompositionText',
            data: change.insert || null,
            trusted: true,
          },
          caret: change.start + change.insert.length,
        });
      }}
      onBeforeInput={(e) => {
        const input = e.nativeEvent;
        // Chrome still delivers some typing as a legacy TextEvent: `data` is set and `inputType` is not.
        const inputType = input.inputType || (typeof input.data === 'string' ? 'insertText' : '');
        if (composing.current || inputType === 'insertCompositionText') return;
        const now = Date.now();
        const sinceLastMs = lastKeyAt.current != null ? now - lastKeyAt.current : null;
        const classified = classifyInsertion({
          inputType,
          trusted: input.isTrusted,
          data: input.data ?? null,
          sinceLastMs,
        });
        if (classified.kind === 'ignore') return;
        if (classified.kind === 'split') {
          e.preventDefault();
          const at = selection().start;
          caret.current = 0;
          onSplit?.(at);
          return;
        }
        if (
          (classified.kind === 'insert' && (classified.origin === 'paste' || classified.origin === 'drop')) ||
          skipPaste.current
        ) {
          e.preventDefault();
          return;
        }
        if (classified.kind === 'delete' && selection().start === 0 && selection().end === 0) {
          e.preventDefault();
          onMergeBackward?.();
          return;
        }
        // Let the browser insert or delete. onInput diffs the DOM so fast typing
        // cannot land every character at a stale caret.
        pending.current = {
          origin: classified.kind === 'delete' ? null : classified.origin,
          inputType: inputType || (classified.kind === 'delete' ? 'deleteContentBackward' : 'insertText'),
          trusted: input.isTrusted,
        };
        if (classified.kind === 'insert' && classified.origin === 'keyboard') lastKeyAt.current = now;
      }}
      onInput={() => {
        if (composing.current) return;
        const el = ref.current;
        if (!el) return;
        const next = (el.textContent ?? '').replace(/\u00a0/g, ' ');
        const before = textRef.current;
        if (next === before) return;
        const change = diff(before, next);
        textRef.current = next;
        const meta = pending.current;
        pending.current = null;
        const typedKey = lastKey.current;
        lastKey.current = null;
        const sinceLastMs = lastKeyAt.current != null ? Date.now() - lastKeyAt.current : null;
        const classified = change.insert
          ? classifyInsertion({
              inputType: meta?.inputType ?? 'insertText',
              trusted: meta?.trusted ?? true,
              data: change.insert,
              sinceLastMs,
            })
          : null;
        let origin = meta
          ? meta.origin
          : classified?.kind === 'insert'
            ? classified.origin
            : typedKey && change.insert === typedKey
              ? 'keyboard'
              : change.insert
                ? 'other'
                : null;
        // beforeinput may have seen an empty or one-character payload while the
        // field actually received a multi-character dictation insert.
        if (
          change.insert.length > MAX_KEYBOARD_INSERT_CHARS &&
          origin !== 'paste' &&
          origin !== 'drop' &&
          classified?.kind === 'insert' &&
          classified.origin === 'dictation'
        ) {
          origin = 'dictation';
        }
        if (origin === 'keyboard') lastKeyAt.current = Date.now();
        const caretPos = selection().end;
        caret.current = caretPos;
        onCommit({
          start: change.start,
          end: change.end,
          insert: change.insert,
          origin,
          event: {
            at: new Date().toISOString(),
            inputType: meta?.inputType ?? (change.insert ? 'insertText' : 'deleteContentBackward'),
            data: change.insert || null,
            trusted: meta?.trusted ?? true,
          },
          caret: caretPos,
        });
      }}
      onPaste={(e) => {
        e.preventDefault();
        const insert = e.clipboardData.getData('text/plain');
        if (!insert) return;
        const pasteHint = describePasteSource(e.clipboardData);
        const range = selection();
        skipPaste.current = true;
        caret.current = range.start + insert.split(/\r?\n/)[0]!.length;
        onCommit({
          start: range.start,
          end: range.end,
          insert,
          origin: 'paste',
          pasteHint,
          event: {
            at: new Date().toISOString(),
            inputType: 'insertFromPaste',
            data: insert,
            trusted: e.nativeEvent.isTrusted,
          },
          caret: range.start + insert.split(/\r?\n/)[0]!.length,
        });
        window.setTimeout(() => {
          skipPaste.current = false;
        }, 0);
      }}
      onDragStart={(e) => {
        const range = selection();
        if (range.end <= range.start) return;
        e.dataTransfer.setData('application/x-humanuscript-text', `${range.start}:${range.end}`);
        e.dataTransfer.effectAllowed = 'move';
        onInternalDrag?.(range.start, range.end);
      }}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes('application/x-humanuscript-block')) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('application/x-humanuscript-text')) {
          onInternalDrop?.(selection().start);
          return;
        }
        const insert = e.dataTransfer.getData('text/plain');
        if (!insert) return;
        const range = selection();
        caret.current = range.start + insert.length;
        onCommit({
          start: range.start,
          end: range.end,
          insert,
          origin: 'drop',
          event: {
            at: new Date().toISOString(),
            inputType: 'insertFromDrop',
            data: insert,
            trusted: e.nativeEvent.isTrusted,
          },
          caret: range.start + insert.length,
        });
      }}
      onKeyDown={(e) => {
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) lastKey.current = e.key;
        if (e.key === 'Backspace' && !textRef.current && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          onMergeBackward?.();
          return;
        }
        const meta = e.metaKey || e.ctrlKey;
        if (!meta || e.altKey) return;
        const key = e.key.toLowerCase();
        if (key === 'b' || key === 'i' || key === 'u') {
          e.preventDefault();
          onFormat?.(key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline');
        }
      }}
      onKeyUp={report}
      onMouseUp={report}
      onPointerMove={(e) => {
        if (!showProvenance || !onCertificationHover) return;
        const el = e.target instanceof Element ? e.target : null;
        const node = el?.closest('.prov');
        const cardId = node instanceof HTMLElement ? node.dataset.card : undefined;
        if (cardId) onCertificationHover(cardId);
      }}
      onFocus={report}
      onContextMenu={(e) => {
        e.preventDefault();
        const sel = selection();
        const point = rangeFromPoint(e.clientX, e.clientY);
        const el = ref.current;
        const at =
          point && el && el.contains(point.startContainer)
            ? offsetsFromDomRange(el, point).start
            : sel.start;
        if (point && el && el.contains(point.startContainer)) {
          const rect = point.getBoundingClientRect();
          anchorRef.current = {
            range: point,
            dx: e.clientX - rect.left,
            dy: e.clientY - rect.top,
          };
        } else {
          anchorRef.current = null;
        }
        const word = wordAroundOffset(textRef.current, at);
        const suggestions = word
          ? collectSpellSuggestions({
              word: word.word,
              event: e.nativeEvent,
              platform:
                window.speakfiction?.device?.spellSuggestions ?? window.humanuscript?.getSpellSuggestions,
            })
          : [];
        replaceRef.current = word && suggestions.length ? { start: word.start, end: word.end } : null;
        setMenu({
          x: e.clientX,
          y: e.clientY,
          hasSelection: sel.end > sel.start,
          suggestions,
          misspelledWord: suggestions.length && word ? word.word : null,
        });
      }}
      style={{
        paddingLeft: indentLevel ? `${indentLevel * 1.25}rem` : undefined,
      }}
    />
    <FieldContextMenu
      state={menu}
      anchorRef={anchorRef}
      onClose={() => {
        anchorRef.current = null;
        replaceRef.current = null;
        setMenu(null);
      }}
      onCut={() => document.execCommand('cut')}
      onCopy={() => document.execCommand('copy')}
      onPaste={async () => {
        const text = await navigator.clipboard.readText().catch(() => '');
        if (!text) return;
        const range = selection();
        onCommit({
          start: range.start,
          end: range.end,
          insert: text,
          origin: 'paste',
          pasteHint: 'Paste · clipboard API',
          event: {
            at: new Date().toISOString(),
            inputType: 'insertFromPaste',
            data: text,
            trusted: true,
          },
          caret: range.start + text.length,
        });
      }}
      onSelectAll={() => {
        const el = ref.current;
        if (!el) return;
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }}
      onInsertTable={() => onInsertTable?.()}
      onInsertImage={() => onInsertImage?.()}
      onInsertPageBreak={() => onInsertPageBreak?.()}
      onInsertDivider={() => onInsertDivider?.()}
      onInsertBlockquote={() => onInsertBlockquote?.()}
      onReplaceWord={(replacement) => {
        const range = replaceRef.current;
        if (!range) return;
        const change = spellcheckReplacement({
          start: range.start,
          end: range.end,
          insert: replacement,
          at: new Date().toISOString(),
        });
        caret.current = change.caret;
        onCommit(change);
      }}
    />
    </>
  );
}

function rangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos?.offsetNode) {
    try {
      const range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
      return range;
    } catch {
      return null;
    }
  }
  const legacy = doc.caretRangeFromPoint?.(x, y);
  return legacy ? legacy.cloneRange() : null;
}
