import type { Block, Manuscript } from './types';
import type { Segment } from './audioCues';
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
      out[out.length - 1] = {
        ...last,
        text: `${last.text ?? ''} ${seg.text}`.trim(),
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
  const index = resolveInsertIndex(blocks, dest);
  if (index == null || index >= blocks.length) {
    return appendSegments(blocks, segments);
  }

  const target = blocks[index];
  if (typeof dest?.splitOffset === 'number' && target?.type === 'paragraph') {
    const text = target.text ?? '';
    const off = Math.max(0, Math.min(Math.floor(dest.splitOffset), text.length));
    if (off > 0 && off < text.length) {
      const left = text.slice(0, off).replace(/\s+$/, '');
      const right = text.slice(off).replace(/^\s+/, '');
      const before = blocks.slice(0, index);
      const after = blocks.slice(index + 1);
      const leftBlock: Block[] = left ? [{ ...target, text: left }] : [];
      const rightBlock: Block[] = right ? [{ ...target, id: uid('blk'), text: right }] : [];
      const inserted = appendSegments([], segments);
      return [...before, ...leftBlock, ...inserted, ...rightBlock, ...after];
    }
    if (off >= text.length) {
      const before = blocks.slice(0, index + 1);
      const after = blocks.slice(index + 1);
      return [...before, ...appendSegments([], segments), ...after];
    }
  }

  const before = blocks.slice(0, index);
  const after = blocks.slice(index);
  return [...before, ...appendSegments([], segments), ...after];
}

export interface ManuscriptStats {
  words: number;
  chapters: number;
  scenes: number;
  sections: number;
  paragraphs: number;
}

export function manuscriptStats(m: Manuscript): ManuscriptStats {
  const stats: ManuscriptStats = { words: 0, chapters: 0, scenes: 0, sections: 0, paragraphs: 0 };
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
