import { describe, expect, it } from 'vitest';
import { GENRE_LIST, GENRES, getGenre } from '../genres';

describe('GENRE_LIST', () => {
  it('includes romance, queer-lit, and ya as first-class profiles', () => {
    const ids = GENRE_LIST.map((g) => g.id);
    expect(ids).toContain('romance');
    expect(ids).toContain('queer-lit');
    expect(ids).toContain('ya');
    expect(GENRE_LIST).toHaveLength(Object.keys(GENRES).length);
  });
});

describe('getGenre', () => {
  it('loads romance punctuation used by dictation', () => {
    const g = getGenre('romance');
    expect(g.name).toBe('Romance');
    expect(g.quoteStyle).toBe('curly');
    expect(g.dashStyle).toBe('em');
    expect(g.oxfordComma).toBe(true);
    expect(g.useEllipsisGlyph).toBe(true);
    expect(g.sceneBreakGlyph).toBe('♥');
  });

  it('loads queer-lit as a literary-curly fiction profile', () => {
    const g = getGenre('queer-lit');
    expect(g.name).toBe('Queer Lit');
    expect(g.quoteStyle).toBe('curly');
    expect(g.dashStyle).toBe('em');
    expect(g.oxfordComma).toBe(true);
    expect(g.useEllipsisGlyph).toBe(true);
    expect(g.sceneBreakGlyph).toBe('⁂');
  });

  it('loads ya without falling back to generic', () => {
    const g = getGenre('ya');
    expect(g.id).toBe('ya');
    expect(g.name).toBe('Young Adult');
    expect(g.quoteStyle).toBe('curly');
    expect(g.dashStyle).toBe('em');
    expect(g.oxfordComma).toBe(true);
    expect(g.useEllipsisGlyph).toBe(false);
    expect(g).not.toBe(getGenre('generic'));
  });
});
