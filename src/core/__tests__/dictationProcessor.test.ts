import { describe, expect, it } from 'vitest';
import { processTranscript } from '../dictationProcessor';
import { emptyAdaptiveState } from '../adaptiveModel';
import { getGenre } from '../genres';
import { appendSegments } from '../manuscript';
import type { NameEntry } from '../types';

const entries: NameEntry[] = [
  { id: 'c1', canonical: 'Kaeldros', category: 'character', aliases: ['kaldros'] },
  { id: 'c2', canonical: 'Aelith', category: 'character', aliases: ['aleith'] },
];

const genre = getGenre('fantasy');

describe('processTranscript', () => {
  it('runs the full pipeline: cues + names + punctuation', () => {
    const transcript =
      'new chapter titled The Gathering period ' +
      'kaldros looked at aleith comma his oldest friend period ' +
      'new scene ' +
      'open quote we ride at dawn close quote he said period';

    const result = processTranscript(transcript, {
      entries,
      genre,
      adaptive: emptyAdaptiveState(),
    });

    const kinds = result.segments.map((s) => (s.type === 'structure' ? s.event.kind : 'text'));
    expect(kinds).toEqual(['chapter', 'text', 'scene', 'text']);

    const blocks = appendSegments([], result.segments);
    const chapter = blocks.find((b) => b.type === 'chapter');
    expect(chapter?.title).toBe('The Gathering');

    const prose = blocks
      .filter((b) => b.type === 'paragraph')
      .map((b) => b.text)
      .join('\n');
    expect(prose).toContain('Kaeldros');
    expect(prose).toContain('Aelith');
    expect(prose).toContain('\u201CWe ride at dawn\u201D'); // curly quotes
    expect(prose).toContain(', his oldest friend.');
  });

  it('updates the adaptive model when learning is enabled', () => {
    const result = processTranscript('kaldros ran period', {
      entries,
      genre,
      adaptive: emptyAdaptiveState(),
    });
    expect(result.adaptive.wordsSeen).toBeGreaterThan(0);
    expect(Object.keys(result.adaptive.corrections)).toContain('kaldros');
  });

  it('does not learn in preview mode', () => {
    const result = processTranscript('kaldros ran period', {
      entries,
      genre,
      adaptive: emptyAdaptiveState(),
      learn: false,
    });
    expect(result.adaptive.wordsSeen).toBe(0);
  });
});
