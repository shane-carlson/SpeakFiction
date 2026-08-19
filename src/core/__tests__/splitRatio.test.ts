import { describe, expect, it } from 'vitest';
import {
  clampSplitRatio,
  MANUSCRIPT_SPLIT_DEFAULT,
  MANUSCRIPT_SPLIT_MAX,
  MANUSCRIPT_SPLIT_MIN,
  MANUSCRIPT_SPLIT_MIN_PX,
  normalizeManuscriptSplit,
} from '../splitRatio';

describe('clampSplitRatio', () => {
  it('keeps the dictation split around half with a 240px floor', () => {
    expect(clampSplitRatio(0.48, 1000)).toBe(0.48);
    expect(clampSplitRatio(0.1, 1000)).toBe(0.28);
    expect(clampSplitRatio(0.9, 1000)).toBe(0.72);
    expect(clampSplitRatio(0.2, 700)).toBeCloseTo(240 / 700);
  });

  it('allows a 15% manuscript rail and refuses crushed panes', () => {
    const opts = {
      minRatio: MANUSCRIPT_SPLIT_MIN,
      maxRatio: MANUSCRIPT_SPLIT_MAX,
      minPx: MANUSCRIPT_SPLIT_MIN_PX,
      pinMid: false,
    };
    expect(clampSplitRatio(MANUSCRIPT_SPLIT_DEFAULT, 1200, opts)).toBe(0.15);
    expect(clampSplitRatio(0.05, 1200, opts)).toBe(0.15);
    expect(clampSplitRatio(0.9, 1200, opts)).toBe(0.6);
    expect(clampSplitRatio(0.1, 800, opts)).toBeCloseTo(MANUSCRIPT_SPLIT_MIN_PX / 800);
  });
});

describe('normalizeManuscriptSplit', () => {
  it('keeps a valid rail ratio and falls back otherwise', () => {
    expect(normalizeManuscriptSplit(0.2)).toBe(0.2);
    expect(normalizeManuscriptSplit(MANUSCRIPT_SPLIT_DEFAULT)).toBe(0.15);
    expect(normalizeManuscriptSplit(undefined)).toBe(0.15);
    expect(normalizeManuscriptSplit('15%')).toBe(0.15);
    expect(normalizeManuscriptSplit(0)).toBe(0.15);
    expect(normalizeManuscriptSplit(0.9)).toBe(0.15);
  });
});
