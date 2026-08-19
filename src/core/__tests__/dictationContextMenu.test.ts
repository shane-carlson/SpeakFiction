import { describe, expect, it } from 'vitest';
import {
  applyDictationMenuAction,
  buildDictationContextMenu,
} from '../dictationContextMenu';
import {
  activeTranscript,
  insertCueAt,
  offsetsFromDomRange,
  plainDraft,
  promoteSelectionAsTitle,
  rangeIsStruck,
  setRangeStruck,
  draftText,
  draftToHtml,
} from '../dictationDraft';

describe('setRangeStruck', () => {
  it('strikes only the selected characters and leaves them visible', () => {
    const next = setRangeStruck(plainDraft('Hello. World.'), 7, 13, true);
    expect(draftText(next)).toBe('Hello. World.');
    expect(activeTranscript(next)).toBe('Hello. ');
    expect(next).toEqual([
      { text: 'Hello. ', struck: false },
      { text: 'World.', struck: true },
    ]);
  });

  it('unstrikes a fully struck selection', () => {
    const struck = setRangeStruck(plainDraft('Hello. World.'), 7, 13, true);
    expect(rangeIsStruck(struck, 7, 13)).toBe(true);
    expect(setRangeStruck(struck, 7, 13, false)).toEqual(plainDraft('Hello. World.'));
  });
});

describe('insertCueAt', () => {
  it('appends a structure cue at the end of the draft', () => {
    expect(insertCueAt(plainDraft('hello'), 5, 'new chapter')).toEqual([
      { text: 'hello new chapter ', struck: false },
    ]);
  });

  it('inserts a cue at a caret between sentences', () => {
    const draft = plainDraft('Hello. World.');
    expect(draftText(insertCueAt(draft, 7, 'new paragraph'))).toBe('Hello. new paragraph World.');
  });
});

describe('promoteSelectionAsTitle', () => {
  it('wraps the selection in a new chapter titled cue', () => {
    const draft = plainDraft('period The Gate period');
    const next = promoteSelectionAsTitle(draft, 7, 15, 'chapter');
    expect(draftText(next)).toBe('period new chapter titled The Gate period');
  });

  it('promotes scene and section titles the same way', () => {
    expect(draftText(promoteSelectionAsTitle(plainDraft('The Cellar'), 0, 10, 'scene'))).toBe(
      'new scene titled The Cellar ',
    );
    expect(draftText(promoteSelectionAsTitle(plainDraft('Part Two'), 0, 8, 'section'))).toBe(
      'new section titled Part Two ',
    );
  });
});

describe('buildDictationContextMenu', () => {
  it('puts structure cues and insert dictation at the top when the caret is empty', () => {
    const items = buildDictationContextMenu({ hasSelection: false, canInsertDictation: true });
    expect(items.map((i) => i.label)).toEqual([
      'New chapter',
      'New scene',
      'New paragraph',
      'New section',
      'Insert dictation',
      'Strike last sentence',
      'Period',
      'Comma',
      'Question mark',
      'Open quote',
      'Close quote',
    ]);
  });

  it('offers strike, title promotion, structure, and insert for a selection', () => {
    const items = buildDictationContextMenu({
      hasSelection: true,
      selectionStruck: false,
      canInsertDictation: true,
    });
    expect(items.map((i) => i.label)).toEqual([
      'Strike through',
      'Use as chapter title',
      'Use as scene title',
      'Use as section title',
      'New chapter',
      'New scene',
      'New paragraph',
      'New section',
      'Insert dictation',
    ]);
  });

  it('switches to Unstrike when the selection is already struck', () => {
    const items = buildDictationContextMenu({
      hasSelection: true,
      selectionStruck: true,
      canInsertDictation: false,
    });
    expect(items[0]).toMatchObject({ id: 'unstrike-selection', label: 'Unstrike' });
    expect(items.find((i) => i.id === 'insert-dictation')?.disabled).toBe(true);
  });
});

describe('applyDictationMenuAction', () => {
  it('inserts a cue at the caret without replacing surrounding prose', () => {
    const next = applyDictationMenuAction(plainDraft('Hello. World.'), { type: 'insertCue', cue: 'new scene' }, {
      start: 7,
      end: 7,
    });
    expect(draftText(next)).toBe('Hello. new scene World.');
  });

  it('strikes a highlighted range', () => {
    const next = applyDictationMenuAction(plainDraft('Hello. World.'), { type: 'strikeSelection' }, {
      start: 7,
      end: 13,
    });
    expect(activeTranscript(next).trim()).toBe('Hello.');
  });
});

describe('offsetsFromDomRange', () => {
  it('maps a contenteditable selection onto draft offsets', () => {
    const el = document.createElement('div');
    el.innerHTML = draftToHtml(plainDraft('Hello. World.'));
    const text = el.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 7);
    range.setEnd(text, 13);
    expect(offsetsFromDomRange(el, range)).toEqual({ start: 7, end: 13 });
  });
});
