import { describe, expect, it } from 'vitest';
import {
  activeTranscript,
  appendCueText,
  compactDraft,
  draftFromElement,
  draftText,
  draftToHtml,
  joinDraft,
  normalizeDictationDraft,
  plainDraft,
  strikeLastSentence,
} from '../dictationDraft';

describe('strikeLastSentence', () => {
  it('is a no-op on an empty dictation box', () => {
    expect(strikeLastSentence([])).toEqual([]);
    expect(strikeLastSentence([{ text: '   ', struck: false }])).toEqual([
      { text: '   ', struck: false },
    ]);
  });

  it('strikes a single unpunctuated sentence and keeps it visible', () => {
    expect(strikeLastSentence(plainDraft('the wind howled'))).toEqual([
      { text: 'the wind howled', struck: true },
    ]);
  });

  it('strikes only the last sentence in the dictation box', () => {
    expect(strikeLastSentence(plainDraft('Hello. World.'))).toEqual([
      { text: 'Hello. ', struck: false },
      { text: 'World.', struck: true },
    ]);
  });

  it('treats spoken period as a sentence end', () => {
    expect(
      strikeLastSentence(plainDraft('kel dros drew sun spar period the wind howled period')),
    ).toEqual([
      { text: 'kel dros drew sun spar period ', struck: false },
      { text: 'the wind howled period', struck: true },
    ]);
  });

  it('strikes the previous active sentence when the last is already struck', () => {
    const once = strikeLastSentence(plainDraft('One. Two. Three.'));
    const twice = strikeLastSentence(once);
    expect(activeTranscript(twice).trim()).toBe('One.');
    expect(draftText(twice)).toBe('One. Two. Three.');
  });

  it('is a no-op when every sentence is already struck', () => {
    const all = [{ text: 'Hello.', struck: true }];
    expect(strikeLastSentence(all)).toEqual(all);
  });
});

describe('activeTranscript', () => {
  it('omits struck spans before insert', () => {
    const draft = strikeLastSentence(plainDraft('Hello. World.'));
    expect(activeTranscript(draft).trim()).toBe('Hello.');
    expect(draftText(draft)).toBe('Hello. World.');
  });
});

describe('joinDraft', () => {
  it('appends live speech as unstruck text', () => {
    const prev = strikeLastSentence(plainDraft('Hello.'));
    expect(joinDraft(prev, 'World.')).toEqual([
      { text: 'Hello.', struck: true },
      { text: ' World.', struck: false },
    ]);
  });

  it('does not insert an empty utterance', () => {
    const prev = plainDraft('Hello.');
    expect(joinDraft(prev, '  ')).toEqual(prev);
  });
});

describe('appendCueText', () => {
  it('appends a structural cue as unstruck words', () => {
    expect(appendCueText(plainDraft('hello'), 'period')).toEqual([
      { text: 'hello period ', struck: false },
    ]);
  });
});

describe('normalizeDictationDraft', () => {
  it('migrates a plain-string dictation box to all unstruck', () => {
    expect(normalizeDictationDraft('new chapter period')).toEqual([
      { text: 'new chapter period', struck: false },
    ]);
    expect(normalizeDictationDraft('')).toEqual([]);
  });

  it('round-trips structured struck spans', () => {
    const draft = [
      { text: 'Hello. ', struck: false },
      { text: 'World.', struck: true },
    ];
    expect(normalizeDictationDraft(draft)).toEqual(draft);
  });
});

describe('html round-trip', () => {
  it('preserves strikethrough through the dictation box DOM', () => {
    const draft = compactDraft([
      { text: 'Hello.\n', struck: false },
      { text: 'World.', struck: true },
    ]);
    const el = document.createElement('div');
    el.innerHTML = draftToHtml(draft);
    expect(draftFromElement(el)).toEqual(draft);
  });
});
