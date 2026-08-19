/**
 * Structured dictation-box draft: mixed struck / unstruck spans.
 * Struck sentences stay visible in the box and are omitted on insert.
 */

export interface DraftSpan {
  text: string;
  struck: boolean;
}

export type DictationDraft = DraftSpan[];

const SENTENCE_END =
  /(?:[.!?…]["”']*|\b(?:period|full stop|question mark|exclamation (?:point|mark))\b\.?)(?:[ \t]+|\n+|$)|(?:\n\n+)/gi;

export function compactDraft(draft: DictationDraft): DictationDraft {
  const out: DictationDraft = [];
  for (const span of draft) {
    if (!span.text) continue;
    const last = out[out.length - 1];
    if (last && last.struck === span.struck) last.text += span.text;
    else out.push({ text: span.text, struck: span.struck });
  }
  return out;
}

export function plainDraft(text: string): DictationDraft {
  return text ? [{ text, struck: false }] : [];
}

export function draftText(draft: DictationDraft): string {
  return (draft ?? []).map((s) => s.text).join('');
}

/** Unstruck text only — what Insert into manuscript sends to processTranscript. */
export function activeTranscript(draft: DictationDraft): string {
  return compactDraft(draft ?? [])
    .filter((s) => !s.struck)
    .map((s) => s.text)
    .join('');
}

/**
 * Copy unstruck text out for Insert dictation / Insert into manuscript.
 * The dictation box is never consumed: struck and unstruck spans both stay.
 */
export function takeInsertTranscript(draft: DictationDraft): {
  transcript: string;
  remaining: DictationDraft;
} {
  const remaining = compactDraft(draft ?? []);
  return { transcript: activeTranscript(remaining).trim(), remaining };
}

export function serializeDraft(draft: DictationDraft): string {
  return JSON.stringify(compactDraft(draft ?? []));
}

function trimTrailingWhitespace(draft: DictationDraft): DictationDraft {
  const spans = compactDraft(draft).map((s) => ({ ...s }));
  for (let i = spans.length - 1; i >= 0; i--) {
    spans[i].text = spans[i].text.replace(/\s+$/, '');
    if (spans[i].text) break;
    spans.pop();
  }
  return spans;
}

/** Join live speech onto the dictation box without touching struck spans. */
export function joinDraft(prev: DictationDraft, next: string): DictationDraft {
  if (!next.trim()) return compactDraft(prev ?? []);
  const prevFull = draftText(prev ?? []);
  if (!prevFull.trim()) {
    return compactDraft([...(prev ?? []), { text: next, struck: false }]);
  }
  const a = prevFull.replace(/\s+$/, '');
  const b = next.replace(/^\s+/, '');
  const joiner = /[\u201C"][^\n]*$/.test(a) && /^[\u201C"]/.test(b) ? '\n\n' : ' ';
  return compactDraft([...trimTrailingWhitespace(prev), { text: `${joiner}${b}`, struck: false }]);
}

export function appendCueText(draft: DictationDraft, cue: string): DictationDraft {
  const text = draftText(draft);
  const pad = text && !/[ \n]$/.test(text) ? ' ' : '';
  return compactDraft([...(draft ?? []), { text: `${pad}${cue} `, struck: false }]);
}

function sentenceRanges(text: string): Array<{ start: number; end: number }> {
  if (!text) return [];
  const ranges: Array<{ start: number; end: number }> = [];
  const re = new RegExp(SENTENCE_END.source, SENTENCE_END.flags);
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const end = match.index + match[0].length;
    if (end > last) ranges.push({ start: last, end });
    if (match[0].length === 0) re.lastIndex += 1;
    last = end;
  }
  if (last < text.length) ranges.push({ start: last, end: text.length });
  return ranges.filter((r) => text.slice(r.start, r.end).trim());
}

function flattenDraft(draft: DictationDraft): Array<{ ch: string; struck: boolean }> {
  const chars: Array<{ ch: string; struck: boolean }> = [];
  for (const span of compactDraft(draft ?? [])) {
    for (const ch of span.text) chars.push({ ch, struck: span.struck });
  }
  return chars;
}

function unflattenDraft(chars: Array<{ ch: string; struck: boolean }>): DictationDraft {
  const out: DictationDraft = [];
  for (const { ch, struck } of chars) {
    const last = out[out.length - 1];
    if (last && last.struck === struck) last.text += ch;
    else out.push({ text: ch, struck });
  }
  return out;
}

export function clampDraftRange(
  draft: DictationDraft,
  start: number,
  end: number,
): { start: number; end: number } {
  const n = draftText(draft).length;
  const a = Math.max(0, Math.min(start, n));
  const b = Math.max(a, Math.min(end, n));
  return { start: a, end: b };
}

/** True when every non-whitespace character in the range is already struck. */
export function rangeIsStruck(draft: DictationDraft, start: number, end: number): boolean {
  const { start: a, end: b } = clampDraftRange(draft, start, end);
  if (a === b) return false;
  const chars = flattenDraft(draft);
  let hasContent = false;
  for (let i = a; i < b; i++) {
    if (!chars[i]?.ch.trim()) continue;
    hasContent = true;
    if (!chars[i].struck) return false;
  }
  return hasContent;
}

export function setRangeStruck(
  draft: DictationDraft,
  start: number,
  end: number,
  struck: boolean,
): DictationDraft {
  const { start: a, end: b } = clampDraftRange(draft, start, end);
  if (a === b) return compactDraft(draft ?? []);
  const chars = flattenDraft(draft);
  for (let i = a; i < b; i++) chars[i].struck = struck;
  return unflattenDraft(chars);
}

export function replaceDraftRange(
  draft: DictationDraft,
  start: number,
  end: number,
  text: string,
  struck = false,
): DictationDraft {
  const { start: a, end: b } = clampDraftRange(draft, start, end);
  const chars = flattenDraft(draft);
  const inserted: Array<{ ch: string; struck: boolean }> = [];
  for (const ch of text) inserted.push({ ch, struck });
  return unflattenDraft([...chars.slice(0, a), ...inserted, ...chars.slice(b)]);
}

function paddedInsert(before: string, after: string, piece: string): string {
  const padBefore = before && !/[ \n]$/.test(before) ? ' ' : '';
  const padAfter = after ? (/^[ \n]/.test(after) ? '' : ' ') : ' ';
  return `${padBefore}${piece}${padAfter}`;
}

/** Insert a spoken cue (new chapter, period, …) at a draft caret offset. */
export function insertCueAt(draft: DictationDraft, offset: number, cue: string): DictationDraft {
  const trimmed = cue.trim();
  if (!trimmed) return compactDraft(draft ?? []);
  const text = draftText(draft);
  const o = Math.max(0, Math.min(offset, text.length));
  const insert = paddedInsert(text.slice(0, o), text.slice(o), trimmed);
  return replaceDraftRange(draft, o, o, insert, false);
}

export type TitleKind = 'chapter' | 'scene' | 'section';

/**
 * Replace the selected draft text with `new {kind} titled {selection}` so
 * insert-into-manuscript reuses the existing audio-cue title path.
 */
export function promoteSelectionAsTitle(
  draft: DictationDraft,
  start: number,
  end: number,
  kind: TitleKind,
): DictationDraft {
  const { start: a, end: b } = clampDraftRange(draft, start, end);
  const selected = draftText(draft).slice(a, b).trim();
  if (!selected) return compactDraft(draft ?? []);
  const text = draftText(draft);
  const replacement = paddedInsert(text.slice(0, a), text.slice(b), `new ${kind} titled ${selected}`);
  return replaceDraftRange(draft, a, b, replacement, false);
}

/**
 * Mark the last active (unstruck) sentence in the dictation box as struck.
 * Empty box / no remaining sentence: no-op.
 */
export function strikeLastSentence(draft: DictationDraft): DictationDraft {
  const chars = flattenDraft(draft);
  if (chars.length === 0) return [];

  const text = chars.map((c) => c.ch).join('');
  const ranges = sentenceRanges(text);
  for (let i = ranges.length - 1; i >= 0; i--) {
    const { start, end } = ranges[i];
    let hasActive = false;
    for (let j = start; j < end; j++) {
      if (!chars[j].struck && chars[j].ch.trim()) {
        hasActive = true;
        break;
      }
    }
    if (!hasActive) continue;
    for (let j = start; j < end; j++) chars[j].struck = true;
    return unflattenDraft(chars);
  }
  return compactDraft(draft);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function draftToHtml(draft: DictationDraft): string {
  return compactDraft(draft ?? [])
    .map((span) => {
      const inner = escapeHtml(span.text).replace(/\n/g, '<br>');
      return span.struck ? `<span class="dictation-struck">${inner}</span>` : inner;
    })
    .join('');
}

function isStruckElement(el: Element, inherited: boolean): boolean {
  if (inherited) return true;
  if (el.tagName === 'S' || el.tagName === 'STRIKE') return true;
  return el.classList.contains('dictation-struck');
}

/**
 * Read a contenteditable dictation box back into spans.
 */
export function draftFromElement(root: HTMLElement): DictationDraft {
  if (!root.hasChildNodes()) return [];
  if (root.childNodes.length === 1 && root.firstChild?.nodeName === 'BR') return [];

  const spans: DictationDraft = [];
  const push = (text: string, struck: boolean) => {
    if (!text) return;
    const last = spans[spans.length - 1];
    if (last && last.struck === struck) last.text += text;
    else spans.push({ text, struck });
  };

  let started = false;
  const walk = (node: Node, struck: boolean, isRoot: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      push(node.textContent ?? '', struck);
      started = true;
      return;
    }
    if (node.nodeName === 'BR') {
      push('\n', struck);
      started = true;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const nextStruck = isStruckElement(el, struck);
    const isBlock = !isRoot && /^(DIV|P|LI)$/i.test(el.tagName);
    if (isBlock && started) push('\n', nextStruck);
    for (const child of Array.from(el.childNodes)) {
      walk(child, nextStruck, false);
    }
  };

  walk(root, false, true);
  return compactDraft(spans);
}

/**
 * Map a DOM range inside the dictation box to character offsets in draftText.
 * Uses the same walk as draftFromElement (BR / block → newline).
 */
export function offsetsFromDomRange(root: HTMLElement, range: Range): { start: number; end: number } {
  const locate = (container: Node, offset: number): number => {
    let pos = 0;
    let started = false;
    let found: number | null = null;

    const walk = (node: Node, isRoot: boolean) => {
      if (found != null) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? '';
        if (node === container) {
          found = pos + Math.max(0, Math.min(offset, text.length));
          return;
        }
        pos += text.length;
        started = true;
        return;
      }
      if (node.nodeName === 'BR') {
        if (node === container) {
          found = pos;
          return;
        }
        pos += 1;
        started = true;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      const isBlock = !isRoot && /^(DIV|P|LI)$/i.test(el.tagName);
      if (isBlock && started) pos += 1;
      if (node === container) {
        const children = Array.from(node.childNodes);
        const n = Math.max(0, Math.min(offset, children.length));
        for (let i = 0; i < n; i++) walk(children[i], false);
        if (found == null) found = pos;
        return;
      }
      for (const child of Array.from(el.childNodes)) {
        walk(child, false);
        if (found != null) return;
      }
    };

    walk(root, true);
    return found ?? pos;
  };

  const a = locate(range.startContainer, range.startOffset);
  const b = locate(range.endContainer, range.endOffset);
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

export function normalizeDictationDraft(value: unknown): DictationDraft | null {
  if (typeof value === 'string') return plainDraft(value);
  if (!Array.isArray(value)) return null;
  const spans: DictationDraft = [];
  for (const item of value) {
    if (typeof item === 'string') {
      if (item) spans.push({ text: item, struck: false });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.text !== 'string') continue;
    spans.push({ text: rec.text, struck: Boolean(rec.struck) });
  }
  return compactDraft(spans);
}
