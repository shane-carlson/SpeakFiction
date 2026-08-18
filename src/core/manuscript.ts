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
