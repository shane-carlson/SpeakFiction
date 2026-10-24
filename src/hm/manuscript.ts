/**
 * Structure operations from Speak Fiction's manuscript editor:
 * chapters outrank scenes and sections, which outrank paragraphs.
 * Dragging a heading moves the heading plus the body under it.
 */

import type { BlockType, DividerStyle, InlineMark, ManuscriptBlock } from './types';

const STRUCTURE_RANK: Record<BlockType, number> = {
  chapter: 0,
  scene: 1,
  section: 1,
  paragraph: 2,
  blockquote: 2,
  pageBreak: 2,
  divider: 2,
  table: 2,
  image: 2,
};

const HEADING_TYPES = new Set<BlockType>(['chapter', 'scene', 'section']);

export interface BlockRange {
  start: number;
  end: number;
}

export function emptyBlock(kind: BlockType, id: string): ManuscriptBlock {
  const base: ManuscriptBlock = { id, type: kind, title: '', text: '', marks: [], listStyle: null, indentLevel: 0 };
  if (kind === 'table') {
    return {
      ...base,
      tableRows: [
        ['', '', ''],
        ['', '', ''],
        ['', '', ''],
      ],
    };
  }
  if (kind === 'image') return { ...base, imageSrc: '', imageAlt: '' };
  if (kind === 'pageBreak') return { ...base, type: 'pageBreak' };
  if (kind === 'divider') return { ...base, type: 'divider', dividerStyle: 'scene' };
  if (kind === 'blockquote') return { ...base, type: 'blockquote' };
  return base;
}

export function movableRange(blocks: ManuscriptBlock[], index: number): BlockRange | null {
  if (index < 0 || index >= blocks.length) return null;
  const rank = STRUCTURE_RANK[blocks[index]!.type];
  let end = index + 1;
  while (end < blocks.length && STRUCTURE_RANK[blocks[end]!.type] > rank) end += 1;
  return { start: index, end };
}

export function moveBlockRange(blocks: ManuscriptBlock[], fromIndex: number, dropIndex: number): ManuscriptBlock[] {
  const range = movableRange(blocks, fromIndex);
  if (!range) return blocks;
  const { start, end } = range;
  const drop = Math.max(0, Math.min(Math.floor(dropIndex), blocks.length));
  if (drop >= start && drop <= end) return blocks;
  const moving = blocks.slice(start, end);
  const remaining = [...blocks.slice(0, start), ...blocks.slice(end)];
  const insertAt = drop > start ? drop - (end - start) : drop;
  return [...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)];
}

export function validDropIndices(blocks: ManuscriptBlock[], fromIndex: number): number[] {
  const range = movableRange(blocks, fromIndex);
  if (!range) return [];
  const { start, end } = range;
  const outside = (i: number) => i < start || i > end;
  if (blocks[fromIndex]?.type === 'chapter') {
    const seen = new Set<number>();
    const gaps: number[] = [];
    const add = (i: number) => {
      if (outside(i) && !seen.has(i)) {
        seen.add(i);
        gaps.push(i);
      }
    };
    add(0);
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i]!.type === 'chapter') add(i);
    }
    add(blocks.length);
    return gaps;
  }
  const gaps: number[] = [];
  for (let i = 0; i <= blocks.length; i++) if (outside(i)) gaps.push(i);
  return gaps;
}

export function nearestValidDropIndex(
  pointerY: number,
  gaps: Array<{ index: number; y: number }>,
  valid: Iterable<number>,
): number | null {
  const ok = valid instanceof Set ? valid : new Set(valid);
  let best: number | null = null;
  let bestDist = Infinity;
  for (const gap of gaps) {
    if (!ok.has(gap.index) || !Number.isFinite(gap.y)) continue;
    const dist = Math.abs(gap.y - pointerY);
    if (dist < bestDist) {
      bestDist = dist;
      best = gap.index;
    }
  }
  return best;
}

/** Step a block toward the previous or next valid drop gap. */
export function moveBlockBy(blocks: ManuscriptBlock[], index: number, direction: -1 | 1): ManuscriptBlock[] {
  const range = movableRange(blocks, index);
  if (!range) return blocks;
  const candidates = validDropIndices(blocks, index).filter((gap) =>
    direction < 0 ? gap < range.start : gap > range.end,
  );
  if (!candidates.length) return blocks;
  const target = direction < 0 ? Math.max(...candidates) : Math.min(...candidates);
  return moveBlockRange(blocks, index, target);
}

export function chapterOrder(blocks: ManuscriptBlock[]): Array<{ id: string; number: number; title: string }> {
  const out: Array<{ id: string; number: number; title: string }> = [];
  let number = 0;
  for (const block of blocks) {
    if (block.type !== 'chapter') continue;
    number += 1;
    out.push({ id: block.id, number, title: block.title });
  }
  return out;
}

export function dragPreviewLabel(block: ManuscriptBlock, chapterNo?: number): string {
  if (block.type === 'chapter') {
    const title = block.title.trim();
    return title ? `Chapter ${chapterNo ?? 0} · ${title}` : `Chapter ${chapterNo ?? 0}`;
  }
  if (block.type === 'scene') return block.title.trim() || 'Scene';
  if (block.type === 'section') return block.title.trim() || 'Section';
  if (block.type === 'table') return 'Table';
  if (block.type === 'image') return block.imageCaption?.trim() || block.imageAlt?.trim() || 'Image';
  if (block.type === 'pageBreak') return 'Page break';
  if (block.type === 'divider') return block.title.trim() || 'Scene break';
  if (block.type === 'blockquote') {
    const text = block.text.replace(/\s+/g, ' ').trim();
    if (!text) return 'Block quote';
    return text.length > 42 ? `${text.slice(0, 41)}…` : text;
  }
  const text = block.text.replace(/\s+/g, ' ').trim();
  if (!text) return 'Paragraph';
  return text.length > 42 ? `${text.slice(0, 41)}…` : text;
}

export function unwrapHeading(blocks: ManuscriptBlock[], blockId: string): ManuscriptBlock[] {
  const index = blocks.findIndex((b) => b.id === blockId);
  if (index < 0) return blocks;
  if (!HEADING_TYPES.has(blocks[index]!.type)) return blocks;
  return [...blocks.slice(0, index), ...blocks.slice(index + 1)];
}

export function deleteParagraph(blocks: ManuscriptBlock[], blockId: string): ManuscriptBlock[] {
  return blocks.filter((b) => !(b.id === blockId && b.type === 'paragraph'));
}

export function dividerDisplayText(style: DividerStyle | undefined, title: string): string {
  if (title.trim()) return title.trim();
  const map: Record<DividerStyle, string> = { scene: '* * *', line: '— — —', ornament: '§' };
  return map[style ?? 'scene'];
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function manuscriptStats(blocks: ManuscriptBlock[]): {
  words: number;
  chapters: number;
  scenes: number;
  sections: number;
  paragraphs: number;
} {
  const stats = { words: 0, chapters: 0, scenes: 0, sections: 0, paragraphs: 0 };
  for (const block of blocks) {
    if (block.type === 'chapter') stats.chapters += 1;
    else if (block.type === 'scene') stats.scenes += 1;
    else if (block.type === 'section') stats.sections += 1;
    else if (block.type === 'paragraph' || block.type === 'blockquote') {
      stats.paragraphs += 1;
      stats.words += countWords(block.text);
    }
  }
  return stats;
}

export interface ManuscriptMatch {
  blockId: string;
  field: 'title' | 'text';
  start: number;
  end: number;
}

export function findMatches(blocks: ManuscriptBlock[], query: string): ManuscriptMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: ManuscriptMatch[] = [];
  for (const block of blocks) {
    const fields: Array<['title' | 'text', string]> =
      block.type === 'paragraph' || block.type === 'blockquote'
        ? [['text', block.text]]
        : block.type === 'pageBreak' || block.type === 'divider' || block.type === 'table' || block.type === 'image'
          ? []
          : [['title', block.title]];
    for (const [field, value] of fields) {
      const hay = value.toLowerCase();
      let from = 0;
      while (from <= hay.length) {
        const at = hay.indexOf(needle, from);
        if (at < 0) break;
        hits.push({ blockId: block.id, field, start: at, end: at + needle.length });
        from = at + Math.max(needle.length, 1);
      }
    }
  }
  return hits;
}

/** First match at or after `anchor` in manuscript order. -1 when none remain. */
export function matchIndexAtOrAfter(
  blocks: Array<{ id: string }>,
  matches: ManuscriptMatch[],
  anchor: { blockId: string; field: 'title' | 'text'; at: number },
): number {
  const order = new Map(blocks.map((block, index) => [block.id, index]));
  const anchorOrder = order.get(anchor.blockId);
  if (anchorOrder == null) return -1;
  return matches.findIndex((match) => {
    const matchOrder = order.get(match.blockId);
    if (matchOrder == null) return false;
    if (matchOrder > anchorOrder) return true;
    if (matchOrder < anchorOrder) return false;
    if (match.field !== anchor.field) return anchor.field === 'title' && match.field === 'text';
    return match.start >= anchor.at;
  });
}

export const TABLE_MIN_ROWS = 2;
export const TABLE_MAX_ROWS = 4;
export const TABLE_MIN_COLS = 2;
export const TABLE_MAX_COLS = 8;

function clampTableDim(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/** Empty rectangular table. Dimensions clamp to 2×2 … 4×8. */
export function emptyTableRows(rows: number, cols: number): string[][] {
  const r = clampTableDim(rows, TABLE_MIN_ROWS, TABLE_MAX_ROWS);
  const c = clampTableDim(cols, TABLE_MIN_COLS, TABLE_MAX_COLS);
  return Array.from({ length: r }, () => Array.from({ length: c }, () => ''));
}

export type StructureHeadingKind = 'chapter' | 'scene' | 'section' | 'paragraph';

export function isHeadingType(type: string | undefined): type is 'chapter' | 'scene' | 'section' {
  return type === 'chapter' || type === 'scene' || type === 'section';
}

export function headingLabels(kind: 'chapter' | 'scene' | 'section'): {
  unwrap: string;
  delete: string;
  aria: string;
  confirm: string;
} {
  return {
    unwrap: `Remove ${kind} header`,
    delete: `Delete ${kind}`,
    aria: `${kind.charAt(0).toUpperCase()}${kind.slice(1)} remove options`,
    confirm: `Delete this ${kind} and all of its content?`,
  };
}

export function insertGapHoverLabel(): string {
  return 'Click to insert dictation here';
}

export function insertGapSelectedLabel(): string {
  return 'Dictation inserts here';
}

export function dropPlaceLabel(block: ManuscriptBlock | undefined): string {
  if (!block) return 'Drop here';
  if (block.type === 'chapter') return 'Drop chapter here';
  if (block.type === 'scene') return 'Drop scene here';
  if (block.type === 'section') return 'Drop section here';
  if (block.type === 'image') return 'Drop image here';
  if (block.type === 'table') return 'Drop table here';
  return 'Drop paragraph here';
}

/** Paragraph ids from `anchorId` through `toId`, in manuscript order. */
export function paragraphRangeIds(
  paragraphIds: readonly string[],
  anchorId: string | null,
  toId: string,
): string[] {
  const to = paragraphIds.indexOf(toId);
  if (to < 0) return [];
  const from = anchorId ? paragraphIds.indexOf(anchorId) : -1;
  if (from < 0) return [toId];
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  return paragraphIds.slice(start, end + 1);
}

/** Remove a heading and the body under it, through the next block of the same rank or higher. */
export function deleteMovableRange(blocks: ManuscriptBlock[], blockId: string): ManuscriptBlock[] {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (!isHeadingType(blocks[index]?.type)) return blocks;
  const range = movableRange(blocks, index);
  if (!range) return blocks;
  return [...blocks.slice(0, range.start), ...blocks.slice(range.end)];
}

/**
 * Turn the focused block into a chapter, scene, section, or body paragraph.
 * Images and tables stay as they are. The visible words move with the block.
 */
export function setBlockKind(
  blocks: ManuscriptBlock[],
  blockId: string,
  kind: StructureHeadingKind,
): ManuscriptBlock[] {
  return blocks.map((block) => {
    if (block.id !== blockId) return block;
    if (block.type === 'image' || block.type === 'table') return block;
    if (block.type === kind) return block;
    if (kind === 'paragraph') {
      const text = isHeadingType(block.type) ? block.title : block.text;
      return { ...block, type: 'paragraph', title: '', text, marks: isHeadingType(block.type) ? [] : block.marks };
    }
    const title = isHeadingType(block.type) ? block.title : block.text;
    return { ...block, type: kind, title, text: '', marks: [] };
  });
}

/** Remove selected paragraphs. Headings and other block types stay. */
export function deleteParagraphs(blocks: ManuscriptBlock[], ids: Iterable<string>): ManuscriptBlock[] {
  const drop = new Set(ids);
  const next = blocks.filter((block) => !(block.type === 'paragraph' && drop.has(block.id)));
  return next.length === blocks.length ? blocks : next;
}

/**
 * Merge selected paragraphs into the topmost one, in manuscript order.
 * Click order is ignored. Non-paragraph ids are skipped.
 */
export function combineParagraphs(blocks: ManuscriptBlock[], ids: Iterable<string>): ManuscriptBlock[] {
  const wanted = new Set(ids);
  const selected = blocks.filter((block) => block.type === 'paragraph' && wanted.has(block.id));
  if (selected.length < 2) return blocks;
  const keepId = selected[0]!.id;
  let text = '';
  const marks: InlineMark[] = [];
  for (const part of selected) {
    const piece = part.text ?? '';
    const joiner = text && piece ? ' ' : '';
    const offset = text.length + joiner.length;
    if (joiner) text += joiner;
    for (const mark of part.marks ?? []) {
      marks.push({ kind: mark.kind, start: mark.start + offset, end: mark.end + offset });
    }
    text += piece;
  }
  const merged: ManuscriptBlock = { ...selected[0]!, text, marks };
  const drop = new Set(selected.slice(1).map((block) => block.id));
  return blocks.map((block) => (block.id === keepId ? merged : block)).filter((block) => !drop.has(block.id));
}

