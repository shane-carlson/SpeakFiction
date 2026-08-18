import { describe, expect, it } from 'vitest';
import {
  PARA_MARK,
  applyGenreDashes,
  applyIntroductoryCommas,
  applyListColon,
  applyOxfordComma,
  applyProseStructure,
  explodeParagraphMarks,
  fixDialogueTagCommas,
  preferCommaBeforeQuotedSpeech,
  splitSpeakerParagraphs,
  wrapImpliedDialogue,
} from '../proseStructure';
import { getGenre } from '../genres';
import { applyPunctuation } from '../punctuation';

const literary = getGenre('literary');
const generic = getGenre('generic');
const thriller = getGenre('thriller');

describe('wrapImpliedDialogue', () => {
  it('quotes unquoted speech with a trailing tag and a US comma', () => {
    expect(wrapImpliedDialogue('hello he said', '\u201C', '\u201D')).toBe('\u201CHello,\u201D he said.');
  });

  it('does not quote narration without a speech tag', () => {
    expect(wrapImpliedDialogue('the wind howled', '\u201C', '\u201D')).toBe('the wind howled');
  });

  it('wraps a leading tag as He said, “Hello.”', () => {
    expect(wrapImpliedDialogue('He said hello', '\u201C', '\u201D')).toBe('He said, \u201CHello.\u201D');
  });

  it('does not wrap indirect speech', () => {
    expect(wrapImpliedDialogue('He said that the sky was dark', '\u201C', '\u201D')).toBe(
      'He said that the sky was dark',
    );
    expect(wrapImpliedDialogue('He said nothing', '\u201C', '\u201D')).toBe('He said nothing');
  });

  it('quotes Whisper-like speech with a trailing tag after narration', () => {
    const out = wrapImpliedDialogue(
      'the wind howled across the keep you should not have come she said',
      '\u201C',
      '\u201D',
    );
    expect(out).toContain('\u201CYou should not have come,');
    expect(out).toContain('she said');
    expect(out).toContain('the wind howled');
    expect(out.indexOf('the wind howled')).toBeLessThan(out.indexOf('\u201C'));
  });

  it('treats she goes as a said-tag for messy STT', () => {
    expect(wrapImpliedDialogue('she goes wait', '\u201C', '\u201D')).toBe(
      'she said, \u201CWait.\u201D',
    );
  });

  it('uses a name-library character as the speaker', () => {
    const out = wrapImpliedDialogue('Aelith you should not have come', '\u201C', '\u201D', [
      'Aelith',
    ]);
    expect(out).toContain('\u201CYou should not have come,');
    expect(out).toContain('Aelith said');
  });
});

describe('fixDialogueTagCommas', () => {
  it('inserts a comma inside an existing quote before a tag', () => {
    expect(fixDialogueTagCommas('\u201CHello\u201D she said')).toBe('\u201CHello,\u201D she said');
  });

  it('does not double-wrap already quoted text', () => {
    const already = '\u201CHello,\u201D she said.';
    expect(applyProseStructure(already, literary)).toContain('\u201CHello,\u201D');
    expect(applyProseStructure(already, literary).match(/\u201C/g)?.length).toBe(1);
  });
});

describe('dashes colons and lists', () => {
  it('turns spaced hyphens into the genre em-dash', () => {
    expect(applyGenreDashes('wait - no', literary)).toBe('wait\u2014no');
  });

  it('prefers comma + quote for said tags, not a colon', () => {
    expect(preferCommaBeforeQuotedSpeech('She whispered: \u201CRun.\u201D')).toBe(
      'She whispered, \u201CRun.\u201D',
    );
  });

  it('adds a colon after “the following” before a list', () => {
    expect(applyListColon('the following Apples, pears')).toBe('the following: Apples, pears');
  });

  it('adds the oxford comma when the genre enables it', () => {
    expect(applyOxfordComma('red, green and blue', literary)).toBe('red, green, and blue');
    expect(applyOxfordComma('red, green and blue', thriller)).toBe('red, green and blue');
  });
});

describe('introductory commas', () => {
  it('commas an introductory clause', () => {
    expect(applyIntroductoryCommas('When the door opened he ran')).toBe(
      'When the door opened, he ran',
    );
  });
});

describe('splitSpeakerParagraphs', () => {
  it('starts a new paragraph when the speaker changes', () => {
    const text = '\u201CHello,\u201D he said. \u201CGet out,\u201D she said.';
    const out = splitSpeakerParagraphs(text);
    expect(out).toContain(PARA_MARK);
    expect(explodeParagraphMarks([{ type: 'text', text: out }])).toHaveLength(3);
  });

  it('splits narration and dialogue into separate paragraphs', () => {
    const text = 'The wind howled. \u201CStay,\u201D she said.';
    expect(splitSpeakerParagraphs(text)).toContain(PARA_MARK);
  });
});

describe('applyProseStructure', () => {
  it('quotes hello he said in the genre style', () => {
    expect(applyProseStructure('hello he said', literary)).toBe('\u201CHello,\u201D he said.');
    expect(applyProseStructure('hello he said', generic)).toBe('"Hello," he said.');
  });

  it('leaves narration unquoted', () => {
    expect(applyProseStructure('The wind howled.', literary)).toBe('The wind howled.');
  });

  it('commas direct address around a capitalized name', () => {
    expect(applyProseStructure('Yes Kaeldros we must ride.', literary)).toBe(
      'Yes, Kaeldros, we must ride.',
    );
  });

  it('still respects spoken punctuation already applied', () => {
    const spoken = applyPunctuation('hello he said period', literary);
    const out = applyProseStructure(spoken, literary);
    expect(out).toMatch(/\u201CHello,/);
    expect(out).toMatch(/he said\./);
  });
});
