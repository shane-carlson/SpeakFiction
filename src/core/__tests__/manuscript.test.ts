import { describe, expect, it } from 'vitest';
import {
  appendSegments,
  chapterOrder,
  emptyManuscript,
  insertEmptyStructure,
  insertSegments,
  manuscriptStats,
  movableRange,
  moveBlockRange,
  resolveInsertIndex,
  setBlockTitle,
  validDropIndices,
} from '../manuscript';
import type { Segment } from '../audioCues';
import type { Block } from '../types';

describe('appendSegments', () => {
  it('builds chapters, scenes, and paragraphs from segments', () => {
    const segments: Segment[] = [
      { type: 'structure', event: { kind: 'chapter', title: 'The Dawn' } },
      { type: 'text', text: 'The sun rose over the hills.' },
      { type: 'structure', event: { kind: 'scene' } },
      { type: 'text', text: 'Later, the rain came.' },
    ];
    const blocks = appendSegments(emptyManuscript().blocks, segments);
    expect(blocks.map((b) => b.type)).toEqual(['chapter', 'paragraph', 'scene', 'paragraph']);
    expect(blocks[0].title).toBe('The Dawn');
  });

  it('merges continuous prose into one paragraph', () => {
    const segments: Segment[] = [
      { type: 'text', text: 'One sentence.' },
      { type: 'text', text: 'Another sentence.' },
    ];
    const blocks = appendSegments([], segments);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('One sentence. Another sentence.');
  });

  it('starts a new paragraph on a paragraph cue', () => {
    const segments: Segment[] = [
      { type: 'text', text: 'First.' },
      { type: 'structure', event: { kind: 'paragraph' } },
      { type: 'text', text: 'Second.' },
    ];
    const blocks = appendSegments([], segments);
    expect(blocks).toHaveLength(2);
  });
});

describe('insertSegments', () => {
  const existing = appendSegments([], [
    { type: 'text', text: 'Before.' },
    { type: 'structure', event: { kind: 'scene' } },
    { type: 'text', text: 'After.' },
  ]);

  it('appends when no destination is given', () => {
    const blocks = insertSegments(existing, [{ type: 'text', text: 'Tail.' }]);
    expect(blocks.at(-1)?.text).toBe('After. Tail.');
  });

  it('splices before a block index without merging into neighbors', () => {
    const blocks = insertSegments(
      existing,
      [{ type: 'structure', event: { kind: 'chapter', title: 'The Gate' } }, { type: 'text', text: 'Mid.' }],
      { atIndex: 1 },
    );
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'chapter', 'paragraph', 'scene', 'paragraph']);
    expect(blocks[0].text).toBe('Before.');
    expect(blocks[1].title).toBe('The Gate');
    expect(blocks[2].text).toBe('Mid.');
    expect(blocks[3].type).toBe('scene');
  });

  it('resolves a block id to that index', () => {
    expect(resolveInsertIndex(existing, { atBlockId: existing[2].id })).toBe(2);
  });

  it('splits a paragraph at the caret so dictation lands between sentences', () => {
    const para = appendSegments([], [{ type: 'text', text: 'Hello. World.' }]);
    const blocks = insertSegments(para, [{ type: 'text', text: 'Inserted.' }], {
      atIndex: 0,
      splitOffset: 7,
    });
    expect(blocks.map((b) => b.text)).toEqual(['Hello.', 'Inserted.', 'World.']);
  });
});

describe('manuscriptStats', () => {
  it('counts words and structure', () => {
    const blocks = appendSegments([], [
      { type: 'structure', event: { kind: 'chapter' } },
      { type: 'text', text: 'four little words here' },
    ]);
    const stats = manuscriptStats({ blocks });
    expect(stats.chapters).toBe(1);
    expect(stats.words).toBe(4);
  });
});

function sampleBook(): Block[] {
  return appendSegments([], [
    { type: 'structure', event: { kind: 'chapter', title: 'The Exile Returns' } },
    { type: 'structure', event: { kind: 'scene', title: 'The Ridge' } },
    { type: 'text', text: 'Kaeldros crested the ridge.' },
    { type: 'structure', event: { kind: 'scene', title: 'The Gates' } },
    { type: 'text', text: 'Two sentries crossed their spears.' },
    { type: 'structure', event: { kind: 'chapter', title: "The Oracle's Warning" } },
    { type: 'structure', event: { kind: 'scene', title: 'The Stair' } },
    { type: 'text', text: 'Aelith waited on the lowest step.' },
  ]);
}

describe('movableRange', () => {
  it('takes a chapter through the next chapter heading', () => {
    const blocks = sampleBook();
    expect(movableRange(blocks, 0)).toEqual({ start: 0, end: 5 });
    expect(movableRange(blocks, 5)).toEqual({ start: 5, end: 8 });
  });

  it('takes a scene through following paragraphs only', () => {
    const blocks = sampleBook();
    expect(movableRange(blocks, 1)).toEqual({ start: 1, end: 3 });
    expect(blocks[1].title).toBe('The Ridge');
  });

  it('moves a paragraph by itself', () => {
    const blocks = sampleBook();
    expect(movableRange(blocks, 2)).toEqual({ start: 2, end: 3 });
  });
});

describe('moveBlockRange', () => {
  it('reorders chapters as a block and renumbers from visual order', () => {
    const blocks = sampleBook();
    const moved = moveBlockRange(blocks, 5, 0);
    expect(chapterOrder(moved).map((c) => c.title)).toEqual([
      "The Oracle's Warning",
      'The Exile Returns',
    ]);
    expect(chapterOrder(moved).map((c) => c.number)).toEqual([1, 2]);
    expect(moved.map((b) => b.type)).toEqual([
      'chapter',
      'scene',
      'paragraph',
      'chapter',
      'scene',
      'paragraph',
      'scene',
      'paragraph',
    ]);
    expect(moved[0].title).toBe("The Oracle's Warning");
    expect(moved[3].title).toBe('The Exile Returns');
  });

  it('preserves custom chapter titles when a chapter is dragged below another', () => {
    const blocks = sampleBook();
    const moved = moveBlockRange(blocks, 0, 8);
    expect(chapterOrder(moved)).toEqual([
      { id: blocks[5].id, number: 1, title: "The Oracle's Warning" },
      { id: blocks[0].id, number: 2, title: 'The Exile Returns' },
    ]);
  });

  it('inserts a dragged chapter between two others instead of only swapping neighbors', () => {
    const blocks = appendSegments([], [
      { type: 'structure', event: { kind: 'chapter', title: 'One' } },
      { type: 'text', text: 'First.' },
      { type: 'structure', event: { kind: 'chapter', title: 'Two' } },
      { type: 'text', text: 'Second.' },
      { type: 'structure', event: { kind: 'chapter', title: 'Three' } },
      { type: 'text', text: 'Third.' },
    ]);
    const moved = moveBlockRange(blocks, 4, 2);
    expect(chapterOrder(moved).map((c) => c.title)).toEqual(['One', 'Three', 'Two']);
    expect(chapterOrder(moved).map((c) => c.number)).toEqual([1, 2, 3]);
    expect(moved.map((b) => b.text ?? b.title)).toEqual([
      'One',
      'First.',
      'Three',
      'Third.',
      'Two',
      'Second.',
    ]);
  });

  it('moves a scene into another chapter', () => {
    const blocks = sampleBook();
    const ridge = blocks[1].id;
    const moved = moveBlockRange(blocks, 1, 6);
    expect(moved.map((b) => b.type)).toEqual([
      'chapter',
      'scene',
      'paragraph',
      'chapter',
      'scene',
      'paragraph',
      'scene',
      'paragraph',
    ]);
    expect(moved[4].id).toBe(ridge);
    expect(moved[4].title).toBe('The Ridge');
    expect(moved[5].text).toBe('Kaeldros crested the ridge.');
  });

  it('moves a paragraph between scenes', () => {
    const blocks = sampleBook();
    const prose = blocks[2].id;
    const moved = moveBlockRange(blocks, 2, 4);
    expect(moved.findIndex((b) => b.id === prose)).toBe(3);
    expect(moved[2].title).toBe('The Gates');
    expect(moved[3].text).toBe('Kaeldros crested the ridge.');
  });

  it('does not drop a range inside itself', () => {
    const blocks = sampleBook();
    expect(moveBlockRange(blocks, 0, 2)).toBe(blocks);
    expect(moveBlockRange(blocks, 0, 0)).toBe(blocks);
    expect(moveBlockRange(blocks, 0, 5)).toBe(blocks);
  });
});

describe('validDropIndices', () => {
  it('limits chapter drops to chapter boundaries', () => {
    const blocks = sampleBook();
    expect(validDropIndices(blocks, 0)).toEqual([8]);
    expect(validDropIndices(blocks, 5)).toEqual([0]);
  });
});

describe('setBlockTitle', () => {
  it('renames a chapter without touching its number or body', () => {
    const blocks = sampleBook();
    const next = setBlockTitle(blocks, blocks[0].id, 'Homecoming');
    expect(next[0].title).toBe('Homecoming');
    expect(chapterOrder(next)[0]).toEqual({ id: blocks[0].id, number: 1, title: 'Homecoming' });
    expect(next[2].text).toBe(blocks[2].text);
  });
});

describe('insertEmptyStructure', () => {
  it('inserts a new scene at a gap without dropping neighboring prose', () => {
    const blocks = sampleBook();
    const next = insertEmptyStructure(blocks, 'scene', { atIndex: 3 });
    expect(next[3].type).toBe('scene');
    expect(next[3].title).toBeUndefined();
    expect(next[4].type).toBe('scene');
    expect(next[5].text).toBe('Two sentries crossed their spears.');
    expect(next).toHaveLength(blocks.length + 1);
  });

  it('inserts an empty paragraph the writer can type into', () => {
    const blocks = sampleBook();
    const next = insertEmptyStructure(blocks, 'paragraph', { atIndex: 3 });
    expect(next[3]).toMatchObject({ type: 'paragraph', text: '' });
    expect(next[2].text).toBe('Kaeldros crested the ridge.');
  });

  it('splits a paragraph when a scene is inserted at the caret', () => {
    const para = appendSegments([], [{ type: 'text', text: 'Hello. World.' }]);
    const next = insertEmptyStructure(para, 'scene', { atIndex: 0, splitOffset: 7 });
    expect(next.map((b) => b.type)).toEqual(['paragraph', 'scene', 'paragraph']);
    expect(next[0].text).toBe('Hello.');
    expect(next[2].text).toBe('World.');
  });
});
