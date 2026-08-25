import { describe, expect, it } from 'vitest';
import {
  activeWordIndex,
  alignWordCues,
  estimateWordCues,
  speechWindowFromPeaks,
  syncWordTimings,
  timingsLookUntrusted,
  wordsForTake,
  type WordCue,
} from '../wordCues';

function evenPeaks(count: number, speechFrom: number, speechTo: number): number[] {
  return Array.from({ length: count }, (_, i) => (i >= speechFrom && i < speechTo ? 0.7 : 0.08));
}

describe('companion word cues', () => {
  it('keeps estimated words inside the spoken window when the take starts with silence', () => {
    const peaks = evenPeaks(20, 2, 18);
    const window = speechWindowFromPeaks(peaks, 10_000);
    expect(window.startMs).toBeGreaterThanOrEqual(900);
    expect(window.startMs).toBeLessThan(1200);
    const words = estimateWordCues('the wind howled over the gate', 10_000, window);
    expect(words[0]?.startMs).toBeGreaterThanOrEqual(900);
    expect(words[words.length - 1]?.endMs).toBeLessThanOrEqual(window.endMs + 1);
  });

  it('shifts stored cues that start at zero when peaks show a pause at the start', () => {
    const peaks = evenPeaks(20, 3, 19);
    const stored: WordCue[] = [
      { word: 'the', startMs: 0, endMs: 400, cued: true },
      { word: 'wind', startMs: 400, endMs: 800, cued: true },
      { word: 'howled', startMs: 800, endMs: 8_000, cued: true },
    ];
    const aligned = alignWordCues(stored, 10_000, peaks);
    expect(aligned[0]?.startMs).toBeGreaterThanOrEqual(1_200);
    expect(activeWordIndex(aligned, 200)).toBe(-1);
    expect(activeWordIndex(aligned, aligned[0].startMs + 10)).toBe(0);
  });

  it('does not highlight the first word during leading silence', () => {
    const words = estimateWordCues('one two three four five six', 12_000, { startMs: 2_000, endMs: 11_000 });
    expect(activeWordIndex(words, 0)).toBe(-1);
    expect(activeWordIndex(words, 1_500)).toBe(-1);
    expect(activeWordIndex(words, words[0].startMs)).toBe(0);
  });

  it('realigns a full-file estimate so tapping the first word seeks into the speech, not 0:00', () => {
    const peaks = evenPeaks(24, 4, 22);
    const guessed = estimateWordCues('one two three four five six', 12_000);
    expect(guessed[0]?.startMs).toBe(0);
    const words = wordsForTake('one two three four five six', 12_000, guessed, peaks);
    expect(words[0]?.startMs).toBeGreaterThan(1_500);
    expect(activeWordIndex(words, 400)).toBe(-1);
  });

  it('leaves cues alone when they already sit in the speech window', () => {
    const peaks = evenPeaks(20, 4, 18);
    const stored: WordCue[] = [
      { word: 'the', startMs: 2_050, endMs: 2_400, cued: true },
      { word: 'gate', startMs: 8_200, endMs: 8_900, cued: true },
    ];
    const aligned = alignWordCues(stored, 10_000, peaks);
    expect(aligned[0]?.startMs).toBe(2_050);
    expect(aligned[1]?.endMs).toBe(8_900);
  });

  it('uses a relative quiet floor so older takes with noisy metering still skip the pause', () => {
    const peaks = Array.from({ length: 20 }, (_, i) => (i >= 3 ? 0.62 : 0.22));
    const window = speechWindowFromPeaks(peaks, 10_000);
    expect(window.startMs).toBeGreaterThanOrEqual(1_200);
  });

  it('maps stored words onto speech-recognizer times, including a leading pause', () => {
    const display: WordCue[] = [
      { word: 'the', startMs: 0, endMs: 400, cued: false },
      { word: 'wind', startMs: 400, endMs: 800, cued: false },
      { word: 'howled', startMs: 800, endMs: 12_000, cued: false },
    ];
    const timed: WordCue[] = [
      { word: 'the', startMs: 1800, endMs: 2200, cued: true },
      { word: 'wind', startMs: 2200, endMs: 2600, cued: true },
      { word: 'howled', startMs: 2600, endMs: 9_400, cued: true },
    ];
    const synced = syncWordTimings(display, timed, 12_000);
    expect(synced.map((item) => item.startMs)).toEqual([1800, 2200, 2600]);
    expect(activeWordIndex(synced, 400)).toBe(-1);
    expect(activeWordIndex(synced, 1850)).toBe(0);
    expect(activeWordIndex(synced, 2300)).toBe(1);
  });

  it('treats full-file guesses as untrusted so older takes can be retimed', () => {
    const guessed = estimateWordCues('one two three four five six', 12_000);
    expect(timingsLookUntrusted(guessed, 12_000)).toBe(true);
    expect(
      timingsLookUntrusted(
        [
          { word: 'one', startMs: 1800, endMs: 2100, cued: true },
          { word: 'two', startMs: 2100, endMs: 9000, cued: true },
        ],
        12_000,
      ),
    ).toBe(false);
  });
});
