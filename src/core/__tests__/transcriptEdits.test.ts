import { describe, expect, it } from 'vitest';
import { emptyAdaptiveState, recordCorrection, suggestCanonical } from '../adaptiveModel';
import {
  applyLearnedCorrections,
  namesFromCorrections,
  wordCorrectionsFromEdit,
} from '../transcriptEdits';

describe('wordCorrectionsFromEdit', () => {
  it('records a substituted name the writer typed in the box', () => {
    expect(wordCorrectionsFromEdit('the wind howled. same waited.', 'the wind howled. Shane waited.')).toEqual([
      { from: 'same', to: 'Shane' },
    ]);
  });

  it('ignores deletions and insertions without a substitution', () => {
    expect(wordCorrectionsFromEdit('the wind howled. extra sentence. rain.', 'the wind howled. rain.')).toEqual([]);
  });

  it('ignores a wholesale replace', () => {
    expect(wordCorrectionsFromEdit('alpha beta gamma delta epsilon zeta', 'one two three four five six seven eight')).toEqual(
      [],
    );
  });
});

describe('namesFromCorrections', () => {
  it('adds Shane to the library without storing same as an alias', () => {
    expect(namesFromCorrections([{ from: 'same', to: 'Shane' }])).toEqual([
      { canonical: 'Shane', aliases: [], category: 'character' },
    ]);
  });

  it('keeps a non-common mishear as an alias', () => {
    expect(namesFromCorrections([{ from: 'kaldros', to: 'Kaeldros' }])[0]?.aliases).toEqual(['kaldros']);
  });
});

describe('applyLearnedCorrections', () => {
  it('replaces a taught same with Shane except after the', () => {
    let s = emptyAdaptiveState();
    s = recordCorrection(s, 'same', 'Shane');
    expect(suggestCanonical(s, 'same')).toBe('Shane');
    expect(applyLearnedCorrections('same waited at the gate.', s)).toBe('Shane waited at the gate.');
    expect(applyLearnedCorrections('the same night the gate held.', s)).toBe('the same night the gate held.');
  });
});
