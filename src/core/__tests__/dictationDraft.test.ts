import { describe, expect, it } from 'vitest';
import {
  activeTranscript,
  appendCueText,
  caretAfterJoin,
  compactDraft,
  draftFromElement,
  draftText,
  draftToHtml,
  isTranscriptInsertAtEnd,
  joinDraft,
  joinDraftAt,
  normalizeDictationDraft,
  offsetsFromDomRange,
  plainDraft,
  setDomCaretFromOffset,
  strikeLastSentence,
  takeInsertTranscript,
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

describe('takeInsertTranscript', () => {
  it('omits struck spans from the manuscript payload and clears the box on promote', () => {
    const draft = [
      { text: 'Hello. ', struck: false },
      { text: 'World.', struck: true },
    ];
    const { transcript, remaining } = takeInsertTranscript(draft);
    expect(transcript).toBe('Hello.');
    expect(remaining).toEqual([]);
  });

  it('promotes the full unstruck staging buffer and leaves nothing behind', () => {
    const draft = [
      { text: 'Keep me. ', struck: false },
      { text: 'Insert me. ', struck: false },
      { text: 'Struck.', struck: true },
    ];
    const { transcript, remaining } = takeInsertTranscript(draft);
    expect(transcript).toBe('Keep me. Insert me.');
    expect(remaining).toEqual([]);
  });

  it('does not clear when there is nothing to insert', () => {
    const struckOnly = [{ text: 'World.', struck: true }];
    expect(takeInsertTranscript(struckOnly)).toEqual({ transcript: '', remaining: struckOnly });
    expect(takeInsertTranscript([]).transcript).toBe('');
    expect(takeInsertTranscript([]).remaining).toEqual([]);
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

  it('keeps a tagged line and the next untagged quote in one paragraph', () => {
    const prev = plainDraft('\u201CStay,\u201D she said.');
    expect(draftText(joinDraft(prev, '\u201CNot as a king.\u201D'))).toBe(
      '\u201CStay,\u201D she said. \u201CNot as a king.\u201D',
    );
  });

  it('starts a new paragraph when a different speaker answers', () => {
    const prev = plainDraft('\u201CHello,\u201D he said.');
    expect(draftText(joinDraft(prev, '\u201CGet out,\u201D she said.'))).toBe(
      '\u201CHello,\u201D he said.\n\n\u201CGet out,\u201D she said.',
    );
  });
});

describe('joinDraftAt', () => {
  it('splices incoming dictation at the caret instead of appending', () => {
    const next = joinDraftAt(plainDraft('Hello. World.'), 'the wind howled', 7);
    expect(draftText(next)).toBe('Hello. the wind howled World.');
    expect(caretAfterJoin(plainDraft('Hello. World.'), next, 7)).toBe('Hello. the wind howled '.length);
  });

  it('falls back to append when the caret is at the end', () => {
    expect(draftText(joinDraftAt(plainDraft('Hello.'), 'World.', 6))).toBe(
      draftText(joinDraft(plainDraft('Hello.'), 'World.')),
    );
  });
});

describe('isTranscriptInsertAtEnd', () => {
  it('treats a missing caret as append-at-end', () => {
    expect(isTranscriptInsertAtEnd(plainDraft('Hello.'), null)).toBe(true);
    expect(isTranscriptInsertAtEnd(plainDraft('Hello.'), undefined)).toBe(true);
    expect(isTranscriptInsertAtEnd(plainDraft('Hello.'), 6)).toBe(true);
  });

  it('is false when the caret sits inside the draft', () => {
    expect(isTranscriptInsertAtEnd(plainDraft('Hello. World.'), 7)).toBe(false);
    expect(isTranscriptInsertAtEnd(plainDraft('Hello.'), 0)).toBe(false);
  });

  it('is true on an empty box', () => {
    expect(isTranscriptInsertAtEnd([], 0)).toBe(true);
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

  it('restores a caret in the middle after rebuilding the box', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    el.innerHTML = draftToHtml(plainDraft('Hello. World.'));
    setDomCaretFromOffset(el, 7);
    const sel = document.getSelection();
    expect(sel && sel.rangeCount > 0).toBe(true);
    expect(offsetsFromDomRange(el, sel!.getRangeAt(0))).toEqual({ start: 7, end: 7 });
    document.body.removeChild(el);
  });
});
