import { describe, expect, it } from 'vitest';
import {
  emptyAdaptiveState,
  learningProgress,
  recordCorrection,
  recordProse,
  suggestCanonical,
} from '../adaptiveModel';

describe('adaptiveModel', () => {
  it('records prose vocabulary and word counts', () => {
    let s = emptyAdaptiveState();
    s = recordProse(s, 'the storm broke the mast');
    const p = learningProgress(s);
    expect(p.wordsSeen).toBe(5);
    expect(p.uniqueWords).toBe(4); // "the" repeats
  });

  it('learns corrections and suggests the most frequent canonical', () => {
    let s = emptyAdaptiveState();
    s = recordCorrection(s, 'kaldros', 'Kaeldros');
    s = recordCorrection(s, 'kaldros', 'Kaeldros');
    s = recordCorrection(s, 'kaldros', 'Kaldros Prime');
    expect(suggestCanonical(s, 'kaldros')).toBe('Kaeldros');
  });

  it('returns null when no correction is known', () => {
    expect(suggestCanonical(emptyAdaptiveState(), 'unknown')).toBeNull();
  });
});
