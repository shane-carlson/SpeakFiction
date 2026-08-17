import { describe, expect, it } from 'vitest';
import { appendSegments, emptyManuscript, manuscriptStats } from '../manuscript';
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
