import { describe, expect, it } from 'vitest';
import { correctNames } from '../nameLibrary';
import type { NameEntry } from '../types';

const entries: NameEntry[] = [
  { id: 'c1', canonical: 'Kaeldros', category: 'character', aliases: ['kaldros', 'kel dros'] },
  { id: 'c2', canonical: 'Aelith', category: 'character', aliases: ['aleith'] },
  { id: 'l1', canonical: 'Vaelthorn Keep', category: 'location', aliases: ['valthorn keep'] },
  { id: 'i1', canonical: 'Sunspar', category: 'item', aliases: [] },
];

describe('correctNames', () => {
  it('fixes a phonetically-close single-word name', () => {
    const { text, applied } = correctNames('Then kaldros drew his blade.', entries);
    expect(text).toContain('Kaeldros');
    expect(applied.some((a) => a.to === 'Kaeldros')).toBe(true);
  });

  it('fixes a multi-word spoken name', () => {
    const { text } = correctNames('he called out to kel dros', entries);
    expect(text).toContain('Kaeldros');
    expect(text).not.toContain('kel dros');
  });

  it('fixes multi-word location names', () => {
    const { text } = correctNames('they marched on valthorn keep at dawn', entries);
    expect(text).toContain('Vaelthorn Keep');
  });

  it('preserves surrounding punctuation', () => {
    const { text } = correctNames('"kaldros," she whispered.', entries);
    expect(text).toContain('"Kaeldros,"');
  });

  it('does not touch ordinary words', () => {
    const { text, applied } = correctNames('the sun was warm and the road was long', entries);
    expect(text).toBe('the sun was warm and the road was long');
    expect(applied).toHaveLength(0);
  });

  it('leaves an already-correct name unchanged but recognized', () => {
    const { text, applied } = correctNames('Kaeldros smiled', entries);
    expect(text).toContain('Kaeldros');
    // exact match should not be reported as a correction
    expect(applied).toHaveLength(0);
  });
});
