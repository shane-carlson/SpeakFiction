import { describe, expect, it, vi } from 'vitest';
import {
  applyChapterHeadingMenuAction,
  buildManuscriptContextMenu,
  CHAPTER_DELETE_ID,
  CHAPTER_DELETE_LABEL,
  CHAPTER_UNWRAP_ID,
  CHAPTER_UNWRAP_LABEL,
  manuscriptInsertMenuItems,
  UNSELECT_INSERT_ID,
  UNSELECT_INSERT_LABEL,
} from '../manuscriptContextMenu';
import {
  createSpellcheckGate,
  findMisspelledRange,
  pickSpellCheckerLanguages,
  replaceMisspelledInMarkedText,
  replaceMisspelledWord,
  SPELLCHECK_ADD_ID,
  suggestionFromMenuId,
  withSpellcheckItems,
} from '../spellcheckMenu';

describe('withSpellcheckItems', () => {
  const insert = manuscriptInsertMenuItems(true);

  it('leaves insert actions first when the word is spelled correctly', () => {
    expect(withSpellcheckItems(insert, null).map((i) => i.label)[0]).toBe('Insert dictation here');
    expect(withSpellcheckItems(insert, { misspelledWord: '', dictionarySuggestions: ['the'] })).toEqual(
      insert,
    );
  });

  it('puts dictionary suggestions at the top of the manuscript menu', () => {
    const items = buildManuscriptContextMenu(true, {
      misspelledWord: 'teh',
      dictionarySuggestions: ['the', 'teh'],
    });
    expect(items.map((i) => i.label)).toEqual([
      'the',
      'teh',
      'Add “teh” to dictionary',
      'Insert dictation here',
      'Insert new chapter',
      'Insert new scene',
      'Insert new section',
      'Insert new paragraph',
      'Insert image',
    ]);
    expect(suggestionFromMenuId(items[0]!.id)).toBe('the');
    expect(items.find((i) => i.id === SPELLCHECK_ADD_ID)?.group).toBe('spellcheck-dict');
  });

  it('shows a disabled No suggestions row when Chromium has a misspelling but no guesses', () => {
    const items = buildManuscriptContextMenu(false, {
      misspelledWord: 'asdfgh',
      dictionarySuggestions: [],
    });
    expect(items[0]).toMatchObject({ label: 'No suggestions', disabled: true, group: 'spellcheck' });
    expect(items[1]?.id).toBe(SPELLCHECK_ADD_ID);
    expect(items[2]).toMatchObject({ id: 'insert-dictation-here', disabled: true });
  });

  it('puts chapter unwrap and delete after spellcheck on a chapter heading', () => {
    const items = buildManuscriptContextMenu(
      true,
      { misspelledWord: 'teh', dictionarySuggestions: ['the'] },
      { chapterHeading: true },
    );
    expect(items.map((i) => i.label)).toEqual([
      'the',
      'Add “teh” to dictionary',
      CHAPTER_UNWRAP_LABEL,
      CHAPTER_DELETE_LABEL,
      'Insert dictation here',
      'Insert new chapter',
      'Insert new scene',
      'Insert new section',
      'Insert new paragraph',
      'Insert image',
    ]);
    expect(items.find((i) => i.id === CHAPTER_UNWRAP_ID)?.group).toBe('chapter');
    expect(items.find((i) => i.id === CHAPTER_DELETE_ID)?.group).toBe('chapter');
  });

  it('leads with Unselect insertion point when a gap is marked', () => {
    const items = buildManuscriptContextMenu(true, null, { canUnselectInsert: true });
    expect(items[0]).toMatchObject({ id: UNSELECT_INSERT_ID, label: UNSELECT_INSERT_LABEL });
    expect(items.map((i) => i.label)).toContain('Insert dictation here');
  });

  it('leads with both chapter actions when the heading is spelled correctly', () => {
    const items = buildManuscriptContextMenu(true, null, { chapterHeading: true });
    expect(items.map((i) => i.label).slice(0, 2)).toEqual([CHAPTER_UNWRAP_LABEL, CHAPTER_DELETE_LABEL]);
  });
});

describe('replaceMisspelledWord', () => {
  it('replaces the word under the caret when the same token appears twice', () => {
    const text = 'teh cat sat on teh mat';
    expect(replaceMisspelledWord(text, 'teh', 'the', 16)).toBe('teh cat sat on the mat');
    expect(findMisspelledRange(text, 'teh', 1)).toEqual({ start: 0, end: 3 });
  });

  it('shifts inline marks when a suggestion changes word length', () => {
    const next = replaceMisspelledInMarkedText(
      'teh wind howled',
      [{ kind: 'italic', start: 4, end: 15 }],
      'teh',
      'thee',
      0,
    );
    expect(next.text).toBe('thee wind howled');
    expect(next.marks).toEqual([{ kind: 'italic', start: 5, end: 16 }]);
  });
});

describe('pickSpellCheckerLanguages', () => {
  it('prefers the OS locale, then en-US', () => {
    expect(pickSpellCheckerLanguages(['en-GB', 'en-US'], 'en-GB')).toEqual(['en-GB']);
    expect(pickSpellCheckerLanguages(['fr-FR', 'en-US'], 'de-DE')).toEqual(['en-US']);
    expect(pickSpellCheckerLanguages(['fr-FR'], 'fr_CA')).toEqual(['fr-FR']);
  });
});

describe('createSpellcheckGate', () => {
  it('returns an offer that arrived before take', async () => {
    const gate = createSpellcheckGate();
    gate.offer({ misspelledWord: 'teh', dictionarySuggestions: ['the'] });
    await expect(gate.take(50)).resolves.toEqual({
      misspelledWord: 'teh',
      dictionarySuggestions: ['the'],
    });
  });

  it('resolves a waiter when Electron sends suggestions after the click', async () => {
    const gate = createSpellcheckGate();
    const pending = gate.take(80);
    gate.offer({ misspelledWord: 'recieve', dictionarySuggestions: ['receive'] });
    await expect(pending).resolves.toEqual({
      misspelledWord: 'recieve',
      dictionarySuggestions: ['receive'],
    });
  });

  it('times out to no hit when spellcheck IPC never arrives', async () => {
    vi.useFakeTimers();
    const gate = createSpellcheckGate();
    const pending = gate.take(40);
    await vi.advanceTimersByTimeAsync(40);
    await expect(pending).resolves.toBeNull();
    vi.useRealTimers();
  });
});

describe('applyChapterHeadingMenuAction', () => {
  it('routes unwrap vs delete-range and ignores other items', () => {
    const unwrapHeading = vi.fn();
    const deleteChapter = vi.fn();
    const actions = { unwrapHeading, deleteChapter };
    expect(applyChapterHeadingMenuAction(CHAPTER_UNWRAP_ID, actions)).toBe(true);
    expect(unwrapHeading).toHaveBeenCalledTimes(1);
    expect(deleteChapter).not.toHaveBeenCalled();
    expect(applyChapterHeadingMenuAction(CHAPTER_DELETE_ID, actions)).toBe(true);
    expect(deleteChapter).toHaveBeenCalledTimes(1);
    expect(applyChapterHeadingMenuAction('insert-chapter', actions)).toBe(false);
    expect(unwrapHeading).toHaveBeenCalledTimes(1);
    expect(deleteChapter).toHaveBeenCalledTimes(1);
  });
});
