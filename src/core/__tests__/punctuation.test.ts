import { describe, expect, it } from 'vitest';
import { applyPunctuation } from '../punctuation';
import { getGenre } from '../genres';

const literary = getGenre('literary');
const generic = getGenre('generic');
const thriller = getGenre('thriller');

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
});
