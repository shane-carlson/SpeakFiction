import { describe, expect, it } from 'vitest';
import { cleanupDictationText, processTranscript } from '../dictationProcessor';
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
    expect(prose).toContain('\u201CWe ride at dawn');
    expect(prose).toContain(', his oldest friend.');
  });

  it('cleanupDictationText quotes Whisper-like dialogue for the transcript box', () => {
    const out = cleanupDictationText('you should not have come she said', {
      entries,
      genre,
    });
    expect(out.text).toMatch(/\u201CYou should not have come,/);
    expect(out.text).toMatch(/she said/);
    expect(out.newCharacters).toEqual([]);
  });

  it('strips New Character plus a repeated name from the transcription box', () => {
    const out = cleanupDictationText('New Character. Andreos. Andreos. the wind howled period', {
      entries,
      genre,
    });
    expect(out.text).toMatch(/wind howled/i);
    expect(out.text).not.toMatch(/new character/i);
    expect(out.text).not.toMatch(/Andreos/i);
    expect(out.newCharacters).toEqual([{ canonical: 'Andreos', aliases: [] }]);
  });

  it('returns new characters even when the remainder is empty', () => {
    const out = cleanupDictationText('New Character. Mara Vale. Mara Vale.', {
      entries,
      genre,
    });
    expect(out.text).toBe('');
    expect(out.newCharacters[0]?.canonical).toBe('Mara Vale');
  });

  it('uses the following sentence as the chapter title and not as a paragraph', () => {
    const result = processTranscript(
      'new chapter the exile returns period kaeldros ran period',
      { entries, genre, adaptive: emptyAdaptiveState() },
    );
    const chapter = result.segments.find((s) => s.type === 'structure' && s.event.kind === 'chapter');
    expect(chapter && chapter.type === 'structure' ? chapter.event.title : '').toMatch(/Exile Returns/i);
    const prose = result.segments
      .filter((s) => s.type === 'text')
      .map((s) => (s.type === 'text' ? s.text : ''))
      .join(' ');
    expect(prose).toMatch(/Kaeldros/);
    expect(prose).not.toMatch(/Exile Returns/i);
  });

  it('keeps a spoken new-chapter cue with title and the prose after period', () => {
    const result = processTranscript('new chapter titled The Gate period the wind howled', {
      entries,
      genre,
      adaptive: emptyAdaptiveState(),
    });
    const chapter = result.segments.find((s) => s.type === 'structure' && s.event.kind === 'chapter');
    expect(chapter && chapter.type === 'structure' ? chapter.event.title : '').toBe('The Gate');
    const prose = result.segments
      .filter((s) => s.type === 'text')
      .map((s) => (s.type === 'text' ? s.text : ''))
      .join(' ');
    expect(prose).toMatch(/wind howled/i);
  });

  it('quotes implied dialogue without requiring open/close quote', () => {
    const result = processTranscript('hello he said period', {
      entries,
      genre,
      adaptive: emptyAdaptiveState(),
    });
    const prose = result.segments
      .filter((s) => s.type === 'text')
      .map((s) => (s.type === 'text' ? s.text : ''))
      .join(' ');
    expect(prose).toBe('\u201CHello,\u201D he said.');
  });

  it('starts a new paragraph when the speaker changes', () => {
    const result = processTranscript(
      'open quote hello close quote he said period open quote get out close quote she said period',
      { entries, genre, adaptive: emptyAdaptiveState() },
    );
    const blocks = appendSegments([], result.segments).filter((b) => b.type === 'paragraph');
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(blocks[0].text).toMatch(/Hello/);
    expect(blocks[1].text).toMatch(/Get out/);
  });

  it('aligns dialogue tags to the book tense without rewriting quoted speech', () => {
    const result = processTranscript(
      'open quote we ride at dawn close quote he says period',
      { entries, genre, adaptive: emptyAdaptiveState(), tense: 'past' },
    );
    const prose = result.segments
      .filter((s) => s.type === 'text')
      .map((s) => (s.type === 'text' ? s.text : ''))
      .join(' ');
    expect(prose).toMatch(/he said/i);
    expect(prose).toMatch(/we ride at dawn/i);
  });

  it('rewrites a post-quote he said to I said in first person only', () => {
    const first = processTranscript(
      'open quote we ride at dawn close quote he said period',
      { entries, genre, adaptive: emptyAdaptiveState(), tense: 'past', perspective: 'first' },
    );
    const firstProse = first.segments
      .filter((s) => s.type === 'text')
      .map((s) => (s.type === 'text' ? s.text : ''))
      .join(' ');
    expect(firstProse).toMatch(/I said/);
    expect(firstProse).not.toMatch(/\bhe said/i);

    const third = processTranscript(
      'open quote we ride at dawn close quote he said period',
      { entries, genre, adaptive: emptyAdaptiveState(), tense: 'past', perspective: 'third-limited' },
    );
    const thirdProse = third.segments
      .filter((s) => s.type === 'text')
      .map((s) => (s.type === 'text' ? s.text : ''))
      .join(' ');
    expect(thirdProse).toMatch(/he said/i);
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

  it.each(['romance', 'queer-lit', 'ya'] as const)(
    'loads the %s genre model through processTranscript (curly quotes, em-dash)',
    (genreId) => {
      const result = processTranscript(
        'open quote wait dash please close quote she said period',
        { entries, genre: getGenre(genreId), adaptive: emptyAdaptiveState() },
      );
      const prose = result.segments
        .filter((s) => s.type === 'text')
        .map((s) => (s.type === 'text' ? s.text : ''))
        .join(' ');
      expect(prose).toContain('\u201CWait\u2014please');
      expect(prose).toMatch(/she said/i);
    },
  );

  it('strips New Character plus a repeated name from manuscript segments', () => {
    const result = processTranscript('New Character. Andreos. Andreos. the wind howled period', {
      entries,
      genre,
      adaptive: emptyAdaptiveState(),
    });
    expect(result.newCharacters).toEqual([{ canonical: 'Andreos', aliases: [] }]);
    const prose = result.segments
      .filter((s) => s.type === 'text')
      .map((s) => (s.type === 'text' ? s.text : ''))
      .join(' ');
    expect(prose).toMatch(/wind howled/i);
    expect(prose).not.toMatch(/new character/i);
    expect(prose).not.toMatch(/Andreos/i);
  });

  it('returns new characters with empty segments when the utterance is only the cue', () => {
    const result = processTranscript('New Character. Kael. Kael.', {
      entries,
      genre,
      adaptive: emptyAdaptiveState(),
    });
    expect(result.newCharacters[0]?.canonical).toBe('Kael');
    expect(result.segments.filter((s) => s.type === 'text')).toEqual([]);
  });
});
