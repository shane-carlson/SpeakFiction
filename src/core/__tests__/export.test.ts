import { describe, expect, it } from 'vitest';
import { toMarkdown, toPlainText, toRtf, toScrivener } from '../export';
import { buildDocx } from '../exportDocx';
import { getGenre } from '../genres';
import { appendSegments } from '../manuscript';
import type { ExportContext } from '../export';

const ctx: ExportContext = { title: 'The Ember King', author: 'A. Writer', genre: getGenre('fantasy') };

const blocks = appendSegments([], [
  { type: 'structure', event: { kind: 'chapter', title: 'The Dawn' } },
  { type: 'text', text: 'The sun rose over Vaelthorn Keep.' },
  { type: 'structure', event: { kind: 'scene' } },
  { type: 'text', text: 'Kaeldros drew his blade.' },
]);
const manuscript = { blocks };

describe('exporters', () => {
  it('produces markdown with headings and scene breaks', () => {
    const md = toMarkdown(manuscript, ctx);
    expect(md).toContain('# The Ember King');
    expect(md).toContain('## The Dawn');
    expect(md).toContain(ctx.genre.sceneBreakGlyph);
    expect(md).toContain('Kaeldros drew his blade.');
  });

  it('produces plain text', () => {
    const txt = toPlainText(manuscript, ctx);
    expect(txt).toContain('THE EMBER KING');
    expect(txt).toContain('THE DAWN');
  });

  it('produces valid-looking RTF', () => {
    const rtf = toRtf(manuscript, ctx);
    expect(rtf.startsWith('{\\rtf1')).toBe(true);
    expect(rtf.trim().endsWith('}')).toBe(true);
    expect(rtf).toContain('The Ember King');
  });

  it('produces a Scrivener bundle with an outline', () => {
    const bundle = toScrivener(manuscript, ctx);
    expect(bundle.outline[0]).toEqual({ level: 1, kind: 'chapter', title: 'The Dawn' });
    expect(bundle.rtf).toContain('{\\rtf1');
  });

  it('builds a docx document without throwing', () => {
    const doc = buildDocx(manuscript, ctx);
    expect(doc).toBeTruthy();
  });
});
