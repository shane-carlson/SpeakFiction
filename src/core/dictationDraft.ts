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

/**
 * Mark the last active (unstruck) sentence in the dictation box as struck.
 * Empty box / no remaining sentence: no-op.
 */
export function strikeLastSentence(draft: DictationDraft): DictationDraft {
  const chars: Array<{ ch: string; struck: boolean }> = [];
  for (const span of compactDraft(draft ?? [])) {
    for (const ch of span.text) chars.push({ ch, struck: span.struck });
  }
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
    const out: DictationDraft = [];
    for (const { ch, struck } of chars) {
      const last = out[out.length - 1];
      if (last && last.struck === struck) last.text += ch;
      else out.push({ text: ch, struck });
    }
    return out;
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
