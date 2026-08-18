import { describe, expect, it } from 'vitest';
import { levenshtein, similarity, soundex, normalizeToken } from '../phonetics';

describe('levenshtein', () => {
  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
  });
});

describe('similarity', () => {
  it('returns 1 for identical strings', () => {
    expect(similarity('kaeldros', 'kaeldros')).toBe(1);
  });
  it('returns a high score for close spellings', () => {
    expect(similarity('kaeldros', 'kaeldross')).toBeGreaterThan(0.8);
  });
});

describe('soundex', () => {
  it('groups phonetically similar names', () => {
    expect(soundex('Kaeldros')).toBe(soundex('Kaeldross'));
    expect(soundex('Robert')).toBe(soundex('Rupert'));
  });
  it('produces a 4-char code', () => {
    expect(soundex('Aelith')).toHaveLength(4);
  });
});

describe('normalizeToken', () => {
  it('strips surrounding punctuation and lowercases', () => {
    expect(normalizeToken('"Kaeldros,"')).toBe('kaeldros');
    expect(normalizeToken('end.')).toBe('end');
  });
});
