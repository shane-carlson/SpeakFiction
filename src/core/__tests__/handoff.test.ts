import { describe, expect, it } from 'vitest';
import { getGenre } from '../genres';
import { liveInsertIsEmpty, toLiveInsertRtf, toLiveInsertText } from '../handoff';
import { appendSegments } from '../manuscript';
import { SCRIVENER_SPLIT_SEPARATOR } from '../export';

const ctx = { title: 'Example: The Ember King', genre: getGenre('fantasy') };

const manuscript = {
  blocks: appendSegments([], [
    { type: 'structure', event: { kind: 'chapter', title: 'The Dawn' } },
    { type: 'text', text: 'The sun rose over Vaelthorn Keep.' },
  ]),
};

describe('live insert payload', () => {
  it('includes headings and prose without Scrivener split markers', () => {
    const text = toLiveInsertText(manuscript, ctx);
    const rtf = toLiveInsertRtf(manuscript, ctx);
    expect(text).toContain('THE DAWN');
    expect(text).toContain('Vaelthorn Keep');
    expect(rtf).toContain('The Dawn');
    expect(rtf).not.toContain(`\\pard ${SCRIVENER_SPLIT_SEPARATOR}\\par`);
  });

  it('treats an empty manuscript as empty', () => {
    expect(liveInsertIsEmpty({ blocks: [] })).toBe(true);
    expect(liveInsertIsEmpty(manuscript)).toBe(false);
  });
});
