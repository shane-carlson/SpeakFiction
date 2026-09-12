import type { Block } from './types';
import { replaceRangeInMarkedText } from './richText';

export type ManuscriptFindField = 'text' | 'title';

export interface ManuscriptMatch {
  blockId: string;
  field: ManuscriptFindField;
  start: number;
  end: number;
}

function searchableFields(block: Block): Array<{ field: ManuscriptFindField; value: string }> {
  if (block.type === 'paragraph') return [{ field: 'text', value: block.text ?? '' }];
  if (block.type === 'chapter' || block.type === 'scene' || block.type === 'section') {
    return [{ field: 'title', value: block.title ?? '' }];
  }
  if (block.type === 'image') {
    return [{ field: 'title', value: block.image?.caption ?? block.title ?? '' }];
  }
  return [];
}

function indexOfAll(hay: string, needle: string): number[] {
  if (!needle) return [];
  const hits: number[] = [];
  let from = 0;
  while (from <= hay.length) {
    const at = hay.indexOf(needle, from);
    if (at < 0) break;
    hits.push(at);
    from = at + Math.max(1, needle.length);
  }
  return hits;
}

export function findManuscriptMatches(
  blocks: Block[],
  query: string,
  caseSensitive = false,
): ManuscriptMatch[] {
  const raw = query;
  if (!raw) return [];
  const needle = caseSensitive ? raw : raw.toLowerCase();
  const out: ManuscriptMatch[] = [];
  for (const block of blocks) {
    for (const { field, value } of searchableFields(block)) {
      const hay = caseSensitive ? value : value.toLowerCase();
      for (const start of indexOfAll(hay, needle)) {
        out.push({ blockId: block.id, field, start, end: start + raw.length });
      }
    }
  }
  return out;
}

function setTitleLike(block: Block, next: string): Block {
  if (block.type === 'image' && block.image) {
    return { ...block, title: next, image: { ...block.image, caption: next } };
  }
  if (block.type === 'chapter' || block.type === 'scene' || block.type === 'section') {
    return { ...block, title: next };
  }
  return block;
}

export function replaceManuscriptMatch(
  blocks: Block[],
  match: ManuscriptMatch,
  replacement: string,
): Block[] {
  return blocks.map((block) => {
    if (block.id !== match.blockId) return block;
    if (match.field === 'text' && block.type === 'paragraph') {
      const next = replaceRangeInMarkedText(block.text ?? '', block.marks, match.start, match.end, replacement);
      return { ...block, text: next.text, marks: next.marks };
    }
    if (match.field === 'title') {
      const value =
        block.type === 'image' ? (block.image?.caption ?? block.title ?? '') : (block.title ?? '');
      const next = value.slice(0, match.start) + replacement + value.slice(match.end);
      return setTitleLike(block, next);
    }
    return block;
  });
}

export function replaceAllManuscriptMatches(
  blocks: Block[],
  query: string,
  replacement: string,
  caseSensitive = false,
): Block[] {
  const matches = findManuscriptMatches(blocks, query, caseSensitive);
  if (!matches.length) return blocks;
  const byBlock = new Map<string, ManuscriptMatch[]>();
  for (const match of matches) {
    const list = byBlock.get(match.blockId) ?? [];
    list.push(match);
    byBlock.set(match.blockId, list);
  }
  return blocks.map((block) => {
    const hits = byBlock.get(block.id);
    if (!hits?.length) return block;
    let next = block;
    for (const match of [...hits].sort((a, b) => b.start - a.start)) {
      const replaced = replaceManuscriptMatch([next], match, replacement)[0];
      if (replaced) next = replaced;
    }
    return next;
  });
}
