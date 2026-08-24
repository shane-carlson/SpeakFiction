import { describe, expect, it } from 'vitest';
import { applyVocab, correctionsFromEdit, looksLikeCorrection, mergeSpeechCues } from '../speechVocab';
import { replaceWordAt } from '../wordCues';

describe('companion speech vocab', () => {
  it('treats close name and word fixes as corrections', () => {
    expect(looksLikeCorrection('Kaldros', 'Kaeldros')).toBe(true);
    expect(looksLikeCorrection('there', 'their')).toBe(true);
    expect(looksLikeCorrection('sword', 'shield')).toBe(false);
    expect(correctionsFromEdit('Kaldros drew his sword', 'Kaeldros drew his sword')).toEqual([
      { heard: 'Kaldros', word: 'Kaeldros' },
    ]);
  });

  it('treats stay → Fae and new capitalized names as library corrections', () => {
    expect(looksLikeCorrection('stay', 'Fae')).toBe(true);
    expect(correctionsFromEdit('stay opened the gate', 'Fae opened the gate')).toEqual([
      { heard: 'stay', word: 'Fae' },
    ]);
    expect(correctionsFromEdit('the wind howled', 'Kaeldros the wind howled')).toEqual([
      { heard: '', word: 'Kaeldros' },
    ]);
  });

  it('keeps more than one heard form for the same canonical name', () => {
    const next = mergeSpeechCues(
      [{ word: 'Fae', heard: 'fay' }],
      [{ word: 'Fae', heard: 'stay' }],
    );
    expect(next.map((cue) => cue.heard)).toEqual(['stay', 'fay']);
    expect(applyVocab('stay and fay arrived', next)).toBe('Fae and Fae arrived');
  });

  it('splits a corrected word into timed tokens', () => {
    const words = replaceWordAt(
      [{ word: 'Kel', startMs: 0, endMs: 400, cued: false }],
      0,
      'Kael Dros',
    );
    expect(words.map((item) => item.word)).toEqual(['Kael', 'Dros']);
    expect(words[0]?.endMs).toBeLessThan(words[1]?.endMs ?? 0);
  });
});
