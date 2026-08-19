import type {
  Block,
  BlockType,
  InlineMark,
  InlineMarkKind,
  Manuscript,
  ManuscriptImage,
  ManuscriptTable,
  TableCell,
} from './types';
import type { Segment } from './audioCues';
import {
  clearFormatting,
  expandCollapsedRange,
  normalizeMarks,
  splitMarkedText,
  toggleMark,
} from './richText';
import { uid } from './util';

export function emptyManuscript(): Manuscript {
  return { blocks: [] };
}

/**
 * Fold an ordered list of dictation segments into the manuscript, immutably.
 * Continuous prose merges into the current paragraph; structural cues and
 * "new paragraph" force a fresh paragraph.
 */
export function appendSegments(blocks: Block[], segments: Segment[]): Block[] {
  const out = blocks.slice();
  const lastInitial = out[out.length - 1];
  let forceNewParagraph = !(lastInitial && lastInitial.type === 'paragraph');

  for (const seg of segments) {
    if (seg.type === 'structure') {
      if (seg.event.kind === 'paragraph') {
        forceNewParagraph = true;
        continue;
      }
      out.push({ id: uid('blk'), type: seg.event.kind, title: seg.event.title });
      forceNewParagraph = true;
      continue;
    }

    const last = out[out.length - 1];
    if (!forceNewParagraph && last && last.type === 'paragraph') {
      const text = `${last.text ?? ''} ${seg.text}`.trim();
      out[out.length - 1] = {
        ...last,
        text,
        marks: normalizeMarks(last.marks, text.length),
      };
    } else {
      out.push({ id: uid('blk'), type: 'paragraph', text: seg.text });
      forceNewParagraph = false;
    }
  }

  return out;
}

/** Where to fold processed dictation into an existing manuscript. */
export interface ManuscriptInsertAt {
  atBlockId?: string;
  atIndex?: number;
  /** Caret inside a paragraph: split that block and insert between the halves. */
  splitOffset?: number;
}

/** Block index to splice at, or `undefined` to append (merge into the last paragraph). */
export function resolveInsertIndex(
  blocks: Block[],
  dest?: Pick<ManuscriptInsertAt, 'atBlockId' | 'atIndex'>,
): number | undefined {
  if (dest?.atIndex != null && Number.isFinite(dest.atIndex) && dest.atIndex >= 0) {
    return Math.min(Math.floor(dest.atIndex), blocks.length);
  }
  if (dest?.atBlockId) {
    const i = blocks.findIndex((b) => b.id === dest.atBlockId);
    if (i >= 0) return i;
  }
  return undefined;
}

/** Split a destination into before/after so callers can splice without merging. */
function spliceAround(
  blocks: Block[],
  dest?: ManuscriptInsertAt,
): { before: Block[]; after: Block[]; append: boolean } {
  const index = resolveInsertIndex(blocks, dest);
  if (index == null || index >= blocks.length) {
    return { before: blocks, after: [], append: true };
  }

  const target = blocks[index];
  if (typeof dest?.splitOffset === 'number' && target?.type === 'paragraph') {
    const text = target.text ?? '';
    const off = Math.max(0, Math.min(Math.floor(dest.splitOffset), text.length));
    if (off > 0 && off < text.length) {
      const split = splitMarkedText(text, target.marks, off);
      const leftBlock: Block[] = split.leftText
        ? [{ ...target, text: split.leftText, marks: split.leftMarks }]
        : [];
      const rightBlock: Block[] = split.rightText
        ? [{ ...target, id: uid('blk'), text: split.rightText, marks: split.rightMarks }]
        : [];
      return {
        before: [...blocks.slice(0, index), ...leftBlock],
        after: [...rightBlock, ...blocks.slice(index + 1)],
        append: false,
      };
    }
    if (off >= text.length) {
      return {
        before: blocks.slice(0, index + 1),
        after: blocks.slice(index + 1),
        append: false,
      };
    }
  }

  return {
    before: blocks.slice(0, index),
    after: blocks.slice(index),
    append: false,
  };
}

/**
 * Fold segments into the manuscript at a block index.
 * Omit dest / past-the-end → same as appendSegments (merge into the last paragraph).
 * Mid-list splice does not merge into neighboring blocks.
 */
export function insertSegments(
  blocks: Block[],
  segments: Segment[],
  dest?: ManuscriptInsertAt,
): Block[] {
  const { before, after, append } = spliceAround(blocks, dest);
  if (append) return appendSegments(blocks, segments);
  return [...before, ...appendSegments([], segments), ...after];
}

/** Hierarchy for drag ranges: a unit includes following lower-rank blocks. */
const STRUCTURE_RANK: Record<BlockType, number> = {
  chapter: 0,
  scene: 1,
  section: 1,
  paragraph: 2,
  image: 2,
  table: 2,
};

const HEADING_TYPES = new Set<BlockType>(['chapter', 'scene', 'section']);

export const TABLE_MIN_ROWS = 2;
export const TABLE_MAX_ROWS = 4;
export const TABLE_MIN_COLS = 2;
export const TABLE_MAX_COLS = 8;

function clampTableDim(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/** Empty rectangular table. Dimensions clamp to 2×2 … 4×8. */
export function emptyTable(rows: number, cols: number): ManuscriptTable {
  const r = clampTableDim(rows, TABLE_MIN_ROWS, TABLE_MAX_ROWS);
  const c = clampTableDim(cols, TABLE_MIN_COLS, TABLE_MAX_COLS);
  const grid: TableCell[][] = [];
  for (let i = 0; i < r; i++) {
    const row: TableCell[] = [];
    for (let j = 0; j < c; j++) row.push({ text: '' });
    grid.push(row);
  }
  return { rows: grid };
}

export interface BlockRange {
  start: number;
  /** Exclusive end index. */
  end: number;
}

/** Chapter heading plus body until the next chapter; scene/section plus body; paragraph alone. */
export function movableRange(blocks: Block[], index: number): BlockRange | null {
  if (index < 0 || index >= blocks.length) return null;
  const rank = STRUCTURE_RANK[blocks[index].type];
  let end = index + 1;
  while (end < blocks.length && STRUCTURE_RANK[blocks[end].type] > rank) {
    end++;
  }
  return { start: index, end };
}

/** Delete only a heading block; following body stays and belongs to whatever precedes. */
export function unwrapHeading(blocks: Block[], blockId: string): Block[] {
  const index = blocks.findIndex((b) => b.id === blockId);
  if (index < 0) return blocks;
  if (!HEADING_TYPES.has(blocks[index].type)) return blocks;
  return [...blocks.slice(0, index), ...blocks.slice(index + 1)];
}

/** Remove the movable range of a block (heading plus body until next same-or-higher rank). */
export function deleteMovableRange(blocks: Block[], blockId: string): Block[] {
  const index = blocks.findIndex((b) => b.id === blockId);
  const range = movableRange(blocks, index);
  if (!range) return blocks;
  return [...blocks.slice(0, range.start), ...blocks.slice(range.end)];
}

/** Blocks that `deleteMovableRange` would drop (for image media cleanup). */
export function blocksInMovableRange(blocks: Block[], blockId: string): Block[] {
  const index = blocks.findIndex((b) => b.id === blockId);
  const range = movableRange(blocks, index);
  if (!range) return [];
  return blocks.slice(range.start, range.end);
}

/**
 * Move a chapter/scene/section (with its body) or a paragraph to a drop gap.
 * `dropIndex` is an insert-gap index in `0…blocks.length`. Same-position and
 * in-range drops are no-ops so a chapter cannot land inside itself.
 */
export function moveBlockRange(blocks: Block[], fromIndex: number, dropIndex: number): Block[] {
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

/**
 * Insert-gap indices that accept a drop of the unit at `fromIndex`.
 * Chapters snap to chapter boundaries (including start/end of the manuscript).
 * Scenes, sections, and paragraphs may land at any gap outside their own range.
 */
export function validDropIndices(blocks: Block[], fromIndex: number): number[] {
  const range = movableRange(blocks, fromIndex);
  if (!range) return [];
  const { start, end } = range;
  const outside = (i: number) => i < start || i > end;
  const gaps: number[] = [];

  if (blocks[fromIndex]?.type === 'chapter') {
    const seen = new Set<number>();
    const add = (i: number) => {
      if (outside(i) && !seen.has(i)) {
        seen.add(i);
        gaps.push(i);
      }
    };
    add(0);
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].type === 'chapter') add(i);
    }
    add(blocks.length);
    return gaps;
  }

  for (let i = 0; i <= blocks.length; i++) {
    if (outside(i)) gaps.push(i);
  }
  return gaps;
}

/** Visual chapter numbers follow list order; titles stay on the block. */
export function chapterOrder(
  blocks: Block[],
): Array<{ id: string; number: number; title: string }> {
  const out: Array<{ id: string; number: number; title: string }> = [];
  let number = 0;
  for (const b of blocks) {
    if (b.type !== 'chapter') continue;
    number++;
    out.push({ id: b.id, number, title: b.title ?? '' });
  }
  return out;
}

export function setBlockTitle(blocks: Block[], blockId: string, title: string): Block[] {
  return blocks.map((b) => (b.id === blockId ? { ...b, title } : b));
}

export type ManuscriptInsertKind = 'chapter' | 'scene' | 'section' | 'paragraph';

function emptyInsertBlock(kind: ManuscriptInsertKind): Block {
  if (kind === 'paragraph') return { id: uid('blk'), type: 'paragraph', text: '' };
  return { id: uid('blk'), type: kind };
}

export function insertImageBlock(
  blocks: Block[],
  image: ManuscriptImage,
  dest?: ManuscriptInsertAt,
): Block[] {
  const incoming: Block[] = [{ id: uid('blk'), type: 'image', image, title: image.caption }];
  const { before, after, append } = spliceAround(blocks, dest);
  if (append) return [...blocks, ...incoming];
  return [...before, ...incoming, ...after];
}

export function insertTableBlock(
  blocks: Block[],
  rows: number,
  cols: number,
  dest?: ManuscriptInsertAt,
): Block[] {
  const incoming: Block[] = [{ id: uid('blk'), type: 'table', table: emptyTable(rows, cols) }];
  const { before, after, append } = spliceAround(blocks, dest);
  if (append) return [...blocks, ...incoming];
  return [...before, ...incoming, ...after];
}

export function setTableCellText(
  blocks: Block[],
  blockId: string,
  row: number,
  col: number,
  text: string,
): Block[] {
  return blocks.map((b) => {
    if (b.id !== blockId || b.type !== 'table' || !b.table) return b;
    const rows = b.table.rows;
    if (row < 0 || row >= rows.length) return b;
    const cells = rows[row];
    if (col < 0 || col >= cells.length) return b;
    const nextRows = rows.map((r, ri) =>
      ri !== row ? r : r.map((cell, ci) => (ci !== col ? cell : { ...cell, text })),
    );
    return { ...b, table: { rows: nextRows } };
  });
}

/** Heading levels map onto manuscript structure, not a parallel HTML heading system. */
export type StructureHeadingKind = 'chapter' | 'scene' | 'section' | 'paragraph';

export function setBlockKind(blocks: Block[], blockId: string, kind: StructureHeadingKind): Block[] {
  return blocks.map((b) => {
    if (b.id !== blockId) return b;
    if (b.type === 'image' || b.type === 'table') return b;
    if (b.type === kind) return b;
    if (kind === 'paragraph') {
      const text = (b.title || b.text || '').trim();
      return { id: b.id, type: 'paragraph', text };
    }
    const title = (b.title || b.text || '').trim();
    return { id: b.id, type: kind, title: title || undefined };
  });
}

export function setParagraphContent(
  blocks: Block[],
  blockId: string,
  text: string,
  marks?: InlineMark[],
): Block[] {
  return blocks.map((b) =>
    b.id === blockId && b.type === 'paragraph'
      ? { ...b, text, marks: normalizeMarks(marks ?? b.marks, text.length) }
      : b,
  );
}

export function formatParagraph(
  blocks: Block[],
  blockId: string,
  range: { start: number; end: number },
  action: { type: 'toggle'; kind: InlineMarkKind } | { type: 'clear' },
): Block[] {
  return blocks.map((b) => {
    if (b.id !== blockId || b.type !== 'paragraph') return b;
    const text = b.text ?? '';
    const start = range.start;
    const end = range.end;
    const nextRange =
      action.type === 'clear'
        ? end > start
          ? { start, end }
          : { start: 0, end: text.length }
        : expandCollapsedRange(text, start, end);
    const next =
      action.type === 'clear'
        ? clearFormatting(b.marks, nextRange.start, nextRange.end, text.length)
        : toggleMark(b.marks, nextRange.start, nextRange.end, action.kind, text.length);
    return { ...b, marks: next };
  });
}

export function setImageCaption(blocks: Block[], blockId: string, caption: string): Block[] {
  return blocks.map((b) => {
    if (b.id !== blockId || b.type !== 'image' || !b.image) return b;
    return { ...b, title: caption, image: { ...b.image, caption } };
  });
}

export function setImageAlt(blocks: Block[], blockId: string, alt: string): Block[] {
  return blocks.map((b) => {
    if (b.id !== blockId || b.type !== 'image' || !b.image) return b;
    return { ...b, image: { ...b.image, alt } };
  });
}

/**
 * Insert an empty structure marker or paragraph at a manuscript destination.
 * Unlike dictation, empty paragraphs are kept so the writer can type into them.
 */
export function insertEmptyStructure(
  blocks: Block[],
  kind: ManuscriptInsertKind,
  dest?: ManuscriptInsertAt,
): Block[] {
  const incoming = [emptyInsertBlock(kind)];
  const { before, after, append } = spliceAround(blocks, dest);
  if (append) return [...blocks, ...incoming];
  return [...before, ...incoming, ...after];
}

export interface ManuscriptStats {
  words: number;
  chapters: number;
  scenes: number;
  sections: number;
  paragraphs: number;
  images: number;
  tables: number;
}

export function manuscriptStats(m: Manuscript): ManuscriptStats {
  const stats: ManuscriptStats = {
    words: 0,
    chapters: 0,
    scenes: 0,
    sections: 0,
    paragraphs: 0,
    images: 0,
    tables: 0,
  };
  for (const b of m.blocks) {
    switch (b.type) {
      case 'chapter':
        stats.chapters++;
        break;
      case 'scene':
        stats.scenes++;
        break;
      case 'section':
        stats.sections++;
        break;
      case 'paragraph':
        stats.paragraphs++;
        stats.words += countWords(b.text ?? '');
        break;
      case 'image':
        stats.images++;
        break;
      case 'table':
        stats.tables++;
        for (const row of b.table?.rows ?? []) {
          for (const cell of row) stats.words += countWords(cell.text ?? '');
        }
        break;
    }
  }
  return stats;
}

export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

/** Remove trailing empty paragraphs (can appear after a dangling cue). */
export function trimEmptyBlocks(blocks: Block[]): Block[] {
  return blocks.filter((b) => b.type !== 'paragraph' || (b.text ?? '').trim() !== '');
}

/** Insert destination from the writer's last caret in the manuscript. */
export function destFromPlace(
  blocks: Block[],
  place?: { blockId?: string; selectionStart?: number },
): ManuscriptInsertAt | undefined {
  if (!place?.blockId) return undefined;
  const atIndex = blocks.findIndex((b) => b.id === place.blockId);
  if (atIndex < 0) return undefined;
  return {
    atBlockId: place.blockId,
    atIndex,
    splitOffset: place.selectionStart,
  };
}
