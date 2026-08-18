import { describe, expect, it } from 'vitest';
import { getGenre } from '../genres';
import { manuscriptStats } from '../manuscript';
import { SCRIVENER_SPLIT_SEPARATOR, toRtf, toScrivener } from '../export';
import {
  EMBER_KING_CHAPTERS,
  EMBER_KING_SERIES,
  EMBER_KING_SERIES_LEGACY,
  EMBER_KING_TITLE,
  EMBER_KING_TITLE_LEGACY,
  emberKingSampleManuscript,
  isTinyEmberKingSeed,
  relabelEmberKingExample,
  relabelEmberKingSeries,
} from '../seedManuscript';

describe('emberKingSampleManuscript', () => {
  const manuscript = emberKingSampleManuscript();
  const stats = manuscriptStats(manuscript);

  it('has five titled chapters and enough scenes and paragraphs for Scrivener', () => {
    const chapters = manuscript.blocks.filter((b) => b.type === 'chapter');
    expect(chapters.map((c) => c.title)).toEqual([...EMBER_KING_CHAPTERS]);
    expect(stats.chapters).toBe(5);
    expect(stats.scenes).toBeGreaterThanOrEqual(10);
    expect(stats.paragraphs).toBeGreaterThanOrEqual(40);
    expect(stats.paragraphs).toBeLessThanOrEqual(80);
  });

  it('includes quoted dialogue and the trained names', () => {
    const prose = manuscript.blocks
      .filter((b) => b.type === 'paragraph')
      .map((b) => b.text ?? '')
      .join('\n');
    expect(prose).toContain('\u201C');
    expect(prose).toContain('Kaeldros');
    expect(prose).toContain('Aelith');
    expect(prose).toContain('Vaelthorn Keep');
    expect(prose).toContain('Sunspar');
    expect(prose).toContain('Ashen Order');
  });

  it('exports a Scrivener outline with every chapter and scene', () => {
    const bundle = toScrivener(manuscript, { title: EMBER_KING_TITLE, genre: getGenre('fantasy') });
    const chapters = bundle.outline.filter((o) => o.kind === 'chapter');
    const scenes = bundle.outline.filter((o) => o.kind === 'scene');
    expect(chapters).toHaveLength(5);
    expect(chapters.map((c) => c.title)).toEqual([...EMBER_KING_CHAPTERS]);
    expect(scenes.length).toBe(stats.scenes);
    expect(bundle.rtf).toContain(`\\pard ${SCRIVENER_SPLIT_SEPARATOR}\\par`);
  });

  it('puts a # split delimiter before each of the five chapter titles in RTF', () => {
    const rtf = toRtf(manuscript, { title: EMBER_KING_TITLE, genre: getGenre('fantasy') });
    const marks = rtf.match(new RegExp(`\\\\pard ${SCRIVENER_SPLIT_SEPARATOR}\\\\par`, 'g')) ?? [];
    expect(marks).toHaveLength(5);
    let cursor = 0;
    for (const title of EMBER_KING_CHAPTERS) {
      const sep = rtf.indexOf(`\\pard ${SCRIVENER_SPLIT_SEPARATOR}\\par`, cursor);
      const heading = rtf.indexOf(title, sep);
      expect(sep).toBeGreaterThanOrEqual(0);
      expect(heading).toBeGreaterThan(sep);
      cursor = heading + title.length;
    }
  });
});

describe('isTinyEmberKingSeed', () => {
  it('matches only the original short Ember King sample', () => {
    expect(isTinyEmberKingSeed({ title: EMBER_KING_TITLE_LEGACY, manuscript: { blocks: [{}, {}] } })).toBe(
      true,
    );
    expect(isTinyEmberKingSeed({ title: EMBER_KING_TITLE, manuscript: { blocks: [{}, {}] } })).toBe(true);
    expect(isTinyEmberKingSeed({ title: EMBER_KING_TITLE, manuscript: emberKingSampleManuscript() })).toBe(
      false,
    );
    expect(isTinyEmberKingSeed({ title: 'Other Book', manuscript: { blocks: [{}, {}] } })).toBe(false);
  });
});

describe('relabelEmberKingExample', () => {
  it('prefixes the shipped sample title and series', () => {
    const renamed = relabelEmberKingExample({
      title: EMBER_KING_TITLE_LEGACY,
      manuscript: emberKingSampleManuscript(),
    });
    expect(renamed.title).toBe(EMBER_KING_TITLE);
    expect(relabelEmberKingSeries({ name: EMBER_KING_SERIES_LEGACY }).name).toBe(EMBER_KING_SERIES);
  });

  it('leaves a user book with the same title alone', () => {
    const book = {
      title: EMBER_KING_TITLE_LEGACY,
      manuscript: {
        blocks: Array.from({ length: 12 }, (_, i) => ({ type: 'paragraph' as const, title: `P${i}` })),
      },
    };
    expect(relabelEmberKingExample(book).title).toBe(EMBER_KING_TITLE_LEGACY);
  });
});
