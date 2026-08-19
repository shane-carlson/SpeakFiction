import { describe, expect, it } from 'vitest';
import { applyPunctuation, capitalizeSentences } from '../punctuation';
import { getGenre } from '../genres';

const literary = getGenre('literary');
const generic = getGenre('generic');
const thriller = getGenre('thriller');
const romance = getGenre('romance');
const queerLit = getGenre('queer-lit');
const ya = getGenre('ya');

describe('applyPunctuation', () => {
  it('converts spoken punctuation commands', () => {
    expect(applyPunctuation('the door opened comma slowly period', generic)).toBe(
      'The door opened, slowly.',
    );
  });

  it('handles question and exclamation phrases', () => {
    expect(applyPunctuation('who goes there question mark', generic)).toBe('Who goes there?');
    expect(applyPunctuation('run exclamation point', generic)).toBe('Run!');
  });

  it('applies curly quotes for literary genre', () => {
    const out = applyPunctuation('open quote hello there close quote', literary);
    expect(out).toBe('\u201CHello there\u201D');
  });

  it('applies straight quotes for generic genre', () => {
    const out = applyPunctuation('open quote hello close quote', generic);
    expect(out).toBe('"Hello"');
  });

  it('does not treat a closing straight quote as a new sentence', () => {
    expect(capitalizeSentences('"Hello," he said.')).toBe('"Hello," he said.');
  });

  it('renders dash per genre', () => {
    expect(applyPunctuation('wait dash no', literary)).toContain('\u2014');
  });

  it('capitalizes sentences and the pronoun I', () => {
    expect(applyPunctuation('i ran period then i stopped period', generic)).toBe(
      'I ran. Then I stopped.',
    );
  });

  it('adds the oxford comma when the genre enables it', () => {
    expect(applyPunctuation('red comma green and blue period', literary)).toBe(
      'Red, green, and blue.',
    );
  });

  it('omits the oxford comma for thriller', () => {
    expect(applyPunctuation('red comma green and blue period', thriller)).toBe(
      'Red, green and blue.',
    );
  });

  it('applies romance curly quotes, em-dash, and ellipsis glyph', () => {
    const out = applyPunctuation('open quote wait dash please ellipsis close quote', romance);
    expect(out).toContain('\u201C');
    expect(out).toContain('\u201D');
    expect(out).toContain('\u2014');
    expect(out).toContain('\u2026');
  });

  it('applies queer-lit literary curly quotes and em-dash', () => {
    const out = applyPunctuation('open quote wait dash please close quote', queerLit);
    expect(out).toContain('\u201C');
    expect(out).toContain('\u201D');
    expect(out).toContain('\u2014');
    expect(out).toMatch(/Wait/);
  });

  it('applies ya curly quotes and keeps three-dot ellipses', () => {
    const out = applyPunctuation('open quote wait dash please ellipsis close quote', ya);
    expect(out).toContain('\u201C');
    expect(out).toContain('\u2014');
    expect(out).toContain('...');
    expect(out).not.toContain('\u2026');
  });
});
