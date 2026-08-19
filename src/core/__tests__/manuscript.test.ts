import { describe, expect, it } from 'vitest';
import { appendSegments, emptyManuscript, insertSegments, manuscriptStats, resolveInsertIndex } from '../manuscript';
import type { Segment } from '../audioCues';

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
