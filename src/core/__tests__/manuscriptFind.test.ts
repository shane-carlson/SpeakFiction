import { describe, expect, it } from 'vitest';
import {
  findManuscriptMatches,
  replaceAllManuscriptMatches,
  replaceManuscriptMatch,
} from '../manuscriptFind';
import type { Block } from '../types';

const blocks = (): Block[] => [
  { id: 'c1', type: 'chapter', title: 'The Gate' },
  { id: 'p1', type: 'paragraph', text: 'The wind howled at the gate.' },
  { id: 'p2', type: 'paragraph', text: 'She waited at the Gate.', marks: [{ kind: 'bold', start: 18, end: 22 }] },
];

describe('findManuscriptMatches', () => {
  it('finds paragraph and heading hits in document order', () => {
    const hits = findManuscriptMatches(blocks(), 'gate');
    expect(hits).toEqual([
      { blockId: 'c1', field: 'title', start: 4, end: 8 },
      { blockId: 'p1', field: 'text', start: 23, end: 27 },
      { blockId: 'p2', field: 'text', start: 18, end: 22 },
    ]);
  });

  it('honors match case', () => {
    expect(findManuscriptMatches(blocks(), 'Gate', true)).toEqual([
      { blockId: 'c1', field: 'title', start: 4, end: 8 },
      { blockId: 'p2', field: 'text', start: 18, end: 22 },
    ]);
  });
});

describe('replaceManuscriptMatch', () => {
  it('replaces one hit and remaps marks after it', () => {
    const next = replaceManuscriptMatch(blocks(), {
      blockId: 'p2',
      field: 'text',
      start: 18,
      end: 22,
    }, 'keep');
    expect(next[2].text).toBe('She waited at the keep.');
    expect(next[2].marks).toEqual([{ kind: 'bold', start: 18, end: 22 }]);
  });

  it('replaces all hits, including titles', () => {
    const next = replaceAllManuscriptMatches(blocks(), 'gate', 'keep');
    expect(next[0].title).toBe('The keep');
    expect(next[1].text).toBe('The wind howled at the keep.');
    expect(next[2].text).toBe('She waited at the keep.');
  });
});
