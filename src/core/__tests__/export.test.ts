import { describe, expect, it } from 'vitest';
import { EMBER_KING_TITLE } from '../seedManuscript';
import { SCRIVENER_SPLIT_SEPARATOR, toMarkdown, toPlainText, toRtf, toScrivener } from '../export';
import { buildDocx } from '../exportDocx';
import { getGenre } from '../genres';
import { appendSegments } from '../manuscript';
import type { ExportContext } from '../export';

const ctx: ExportContext = { title: EMBER_KING_TITLE, author: 'A. Writer', genre: getGenre('fantasy') };

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
    expect(md).toContain(`# ${EMBER_KING_TITLE}`);
    expect(md).toContain('## The Dawn');
    expect(md).toContain(ctx.genre.sceneBreakGlyph);
    expect(md).toContain('Kaeldros drew his blade.');
  });

  it('produces plain text', () => {
    const txt = toPlainText(manuscript, ctx);
    expect(txt).toContain('EXAMPLE: THE EMBER KING');
    expect(txt).toContain('THE DAWN');
  });

  it('produces valid-looking RTF with a Scrivener split delimiter before the chapter', () => {
    const rtf = toRtf(manuscript, ctx);
    expect(rtf.startsWith('{\\rtf1')).toBe(true);
    expect(rtf.trim().endsWith('}')).toBe(true);
    expect(rtf).toContain(`\\pard ${SCRIVENER_SPLIT_SEPARATOR}\\par`);
    expect(rtf.indexOf(`\\pard ${SCRIVENER_SPLIT_SEPARATOR}\\par`)).toBeLessThan(rtf.indexOf('The Dawn'));
  });

  it('can emit RTF without Import and Split markers for live paste', () => {
    const rtf = toRtf(manuscript, ctx, { chapterSplit: false });
    expect(rtf).toContain('The Dawn');
    expect(rtf).not.toContain(`\\pard ${SCRIVENER_SPLIT_SEPARATOR}\\par`);
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
