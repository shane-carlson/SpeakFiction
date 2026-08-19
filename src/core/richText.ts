import type { InlineMark, InlineMarkKind } from './types';

export const INLINE_MARK_KINDS: InlineMarkKind[] = ['bold', 'italic', 'underline', 'strike'];

export interface StyledSpan {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Drop empty/invalid ranges, clamp to text, merge overlapping same-kind marks. */
export function normalizeMarks(marks: InlineMark[] | undefined, textLength: number): InlineMark[] {
  const len = Math.max(0, textLength);
  const byKind: Record<InlineMarkKind, Array<{ start: number; end: number }>> = {
    bold: [],
    italic: [],
    underline: [],
    strike: [],
  };
  for (const m of marks ?? []) {
    if (!INLINE_MARK_KINDS.includes(m.kind)) continue;
    const start = clamp(Math.floor(m.start), 0, len);
    const end = clamp(Math.floor(m.end), 0, len);
    if (end <= start) continue;
    byKind[m.kind].push({ start, end });
  }
  const out: InlineMark[] = [];
  for (const kind of INLINE_MARK_KINDS) {
    const ranges = byKind[kind].sort((a, b) => a.start - b.start || a.end - b.end);
    let cur: { start: number; end: number } | null = null;
    for (const r of ranges) {
      if (!cur) {
        cur = { ...r };
        continue;
      }
      if (r.start <= cur.end) cur.end = Math.max(cur.end, r.end);
      else {
        out.push({ kind, start: cur.start, end: cur.end });
        cur = { ...r };
      }
    }
    if (cur) out.push({ kind, start: cur.start, end: cur.end });
  }
  return out;
}

/** Legacy paragraph: plain `text`, no marks. */
export function migratePlainText(text: string | undefined): { text: string; marks: InlineMark[] } {
  return { text: text ?? '', marks: [] };
}

export function rangeHasMark(
  marks: InlineMark[] | undefined,
  start: number,
  end: number,
  kind: InlineMarkKind,
): boolean {
  if (end <= start) return false;
  const covering = (marks ?? []).filter((m) => m.kind === kind);
  if (!covering.length) return false;
  let pos = start;
  const sorted = covering.slice().sort((a, b) => a.start - b.start);
  for (const m of sorted) {
    if (m.end <= pos) continue;
    if (m.start > pos) return false;
    pos = Math.max(pos, m.end);
    if (pos >= end) return true;
  }
  return pos >= end;
}

function subtractRange(
  marks: InlineMark[],
  start: number,
  end: number,
  kind?: InlineMarkKind,
): InlineMark[] {
  if (end <= start) return marks;
  const out: InlineMark[] = [];
  for (const m of marks) {
    if (kind && m.kind !== kind) {
      out.push(m);
      continue;
    }
    if (m.end <= start || m.start >= end) {
      out.push(m);
      continue;
    }
    if (m.start < start) out.push({ ...m, end: start });
    if (m.end > end) out.push({ ...m, start: end });
  }
  return out;
}

export function applyMark(
  marks: InlineMark[] | undefined,
  start: number,
  end: number,
  kind: InlineMarkKind,
  textLength: number,
): InlineMark[] {
  return normalizeMarks([...(marks ?? []), { kind, start, end }], textLength);
}

export function clearFormatting(
  marks: InlineMark[] | undefined,
  start: number,
  end: number,
  textLength: number,
): InlineMark[] {
  return normalizeMarks(subtractRange(marks ?? [], start, end), textLength);
}

export function toggleMark(
  marks: InlineMark[] | undefined,
  start: number,
  end: number,
  kind: InlineMarkKind,
  textLength: number,
): InlineMark[] {
  const current = normalizeMarks(marks, textLength);
  if (end <= start) return current;
  if (rangeHasMark(current, start, end, kind)) {
    return normalizeMarks(subtractRange(current, start, end, kind), textLength);
  }
  return applyMark(current, start, end, kind, textLength);
}

/** Expand a collapsed caret to the word under it, or the whole text if there is no word. */
export function expandCollapsedRange(text: string, start: number, end: number): { start: number; end: number } {
  if (end > start) return { start, end };
  const t = text ?? '';
  if (!t) return { start: 0, end: 0 };
  const pos = clamp(start, 0, t.length);
  const isWord = (ch: string) => /[A-Za-z0-9'’\-]/.test(ch);
  if ((pos < t.length && isWord(t[pos] ?? '')) || (pos > 0 && isWord(t[pos - 1] ?? ''))) {
    let a = pos;
    let b = pos;
    while (a > 0 && isWord(t[a - 1] ?? '')) a--;
    while (b < t.length && isWord(t[b] ?? '')) b++;
    if (b > a) return { start: a, end: b };
  }
  return { start: 0, end: t.length };
}

export interface SplitMarkedText {
  leftText: string;
  leftMarks: InlineMark[];
  rightText: string;
  rightMarks: InlineMark[];
}

/** Split paragraph text at a caret, matching manuscript splice whitespace rules. */
export function splitMarkedText(
  text: string,
  marks: InlineMark[] | undefined,
  offset: number,
): SplitMarkedText {
  const t = text ?? '';
  const off = clamp(Math.floor(offset), 0, t.length);
  const rawLeft = t.slice(0, off);
  const rawRight = t.slice(off);
  const leftText = rawLeft.replace(/\s+$/, '');
  const rightText = rawRight.replace(/^\s+/, '');
  const leftEnd = leftText.length;
  const originRight = off + (rawRight.length - rightText.length);

  const leftMarks: InlineMark[] = [];
  const rightMarks: InlineMark[] = [];
  for (const m of normalizeMarks(marks, t.length)) {
    if (m.start < leftEnd && m.end > 0) {
      const start = Math.max(0, m.start);
      const end = Math.min(leftEnd, m.end);
      if (end > start) leftMarks.push({ kind: m.kind, start, end });
    }
    if (m.end > originRight && m.start < t.length) {
      const start = Math.max(originRight, m.start) - originRight;
      const end = Math.min(originRight + rightText.length, m.end) - originRight;
      if (end > start) rightMarks.push({ kind: m.kind, start, end });
    }
  }
  return {
    leftText,
    leftMarks: normalizeMarks(leftMarks, leftText.length),
    rightText,
    rightMarks: normalizeMarks(rightMarks, rightText.length),
  };
}

export function styledSpans(text: string, marks?: InlineMark[]): StyledSpan[] {
  const t = text ?? '';
  if (!t) return [];
  const normalized = normalizeMarks(marks, t.length);
  const cuts = new Set<number>([0, t.length]);
  for (const m of normalized) {
    cuts.add(m.start);
    cuts.add(m.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const spans: StyledSpan[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (end <= start) continue;
    const slice = t.slice(start, end);
    if (!slice) continue;
    const flags = { bold: false, italic: false, underline: false, strike: false };
    for (const m of normalized) {
      if (m.start <= start && m.end >= end) flags[m.kind] = true;
    }
    const last = spans[spans.length - 1];
    if (
      last &&
      last.bold === flags.bold &&
      last.italic === flags.italic &&
      last.underline === flags.underline &&
      last.strike === flags.strike
    ) {
      last.text += slice;
    } else {
      spans.push({ text: slice, ...flags });
    }
  }
  return spans;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapHtml(inner: string, span: StyledSpan): string {
  let out = inner;
  if (span.strike) out = `<s>${out}</s>`;
  if (span.underline) out = `<u>${out}</u>`;
  if (span.italic) out = `<i>${out}</i>`;
  if (span.bold) out = `<b>${out}</b>`;
  return out;
}

/** HTML for a contenteditable paragraph. Newlines become <br>. */
export function textToHtml(text: string, marks?: InlineMark[]): string {
  const t = text ?? '';
  if (!t) return '';
  return styledSpans(t, marks)
    .map((span) => wrapHtml(escapeHtml(span.text).replace(/\n/g, '<br>'), span))
    .join('');
}

function markFromTag(tag: string): InlineMarkKind | null {
  switch (tag) {
    case 'B':
    case 'STRONG':
      return 'bold';
    case 'I':
    case 'EM':
      return 'italic';
    case 'U':
      return 'underline';
    case 'S':
    case 'STRIKE':
    case 'DEL':
      return 'strike';
    default:
      return null;
  }
}

function styleMarks(el: HTMLElement): InlineMarkKind[] {
  const kinds: InlineMarkKind[] = [];
  const tag = markFromTag(el.tagName);
  if (tag) kinds.push(tag);
  const weight = el.style.fontWeight;
  if (weight === 'bold' || Number(weight) >= 600) kinds.push('bold');
  const fs = el.style.fontStyle;
  if (fs === 'italic' || fs === 'oblique') kinds.push('italic');
  const dec = el.style.textDecoration || el.style.textDecorationLine;
  if (/\bunderline\b/i.test(dec)) kinds.push('underline');
  if (/\bline-through\b/i.test(dec)) kinds.push('strike');
  return kinds;
}

/**
 * Read a contenteditable paragraph back into plain text + marks.
 * Unknown tags are flattened; HTML-less strings stay plain text.
 */
export function htmlToMarkedText(root: HTMLElement): { text: string; marks: InlineMark[] } {
  let text = '';
  const marks: InlineMark[] = [];

  const walk = (node: Node, active: Set<InlineMarkKind>, isRoot: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent ?? '';
      if (!value) return;
      const start = text.length;
      text += value;
      const end = text.length;
      for (const kind of active) marks.push({ kind, start, end });
      return;
    }
    if (node.nodeName === 'BR') {
      text += '\n';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const next = new Set(active);
    for (const kind of styleMarks(el)) next.add(kind);
    const isBlock = !isRoot && /^(DIV|P|LI)$/i.test(el.tagName);
    if (isBlock && text.length > 0 && !text.endsWith('\n')) text += '\n';
    for (const child of Array.from(el.childNodes)) walk(child, next, false);
  };

  walk(root, new Set(), true);
  if (text.endsWith('\n')) text = text.slice(0, -1);
  return { text, marks: normalizeMarks(marks, text.length) };
}

function escapeMd(text: string): string {
  return text.replace(/([\\`*_[\]#])/g, '\\$1');
}

/** Markdown inline for a marked paragraph. Underline uses <u> (no MD equivalent). */
export function markedToMarkdown(text: string, marks?: InlineMark[]): string {
  return styledSpans(text, marks)
    .map((span) => {
      let out = escapeMd(span.text);
      if (span.strike) out = `~~${out}~~`;
      if (span.italic) out = `*${out}*`;
      if (span.bold) out = `**${out}**`;
      if (span.underline) out = `<u>${out}</u>`;
      return out;
    })
    .join('');
}

function rtfEscape(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ch === '\\' || ch === '{' || ch === '}') out += `\\${ch}`;
    else if (code > 127) out += `\\u${code}?`;
    else out += ch;
  }
  return out;
}

/** RTF fragment (no paragraph wrapper) for a marked paragraph. */
export function markedToRtf(text: string, marks?: InlineMark[]): string {
  return styledSpans(text, marks)
    .map((span) => {
      const open =
        (span.bold ? '\\b ' : '') +
        (span.italic ? '\\i ' : '') +
        (span.underline ? '\\ul ' : '') +
        (span.strike ? '\\strike ' : '');
      const close =
        (span.strike ? '\\strike0 ' : '') +
        (span.underline ? '\\ul0 ' : '') +
        (span.italic ? '\\i0 ' : '') +
        (span.bold ? '\\b0 ' : '');
      return `{${open}${rtfEscape(span.text)}${close}}`;
    })
    .join('');
}
