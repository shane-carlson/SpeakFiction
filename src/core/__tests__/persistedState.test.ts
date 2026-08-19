import { describe, expect, it } from 'vitest';
import {
  isAppTab,
  normalizeDictationDrafts,
  normalizeManuscriptPlace,
  normalizeThemeId,
  normalizeThemeMode,
  omitKey,
} from '../persistedState';

describe('persisted session fields', () => {
  it('keeps dictation drafts keyed by book id', () => {
    expect(normalizeDictationDrafts({ 'bk-1': 'new chapter period', 'bk-2': 9 })).toEqual({
      'bk-1': 'new chapter period',
    });
    expect(normalizeDictationDrafts(null)).toEqual({});
  });

  it('keeps manuscript scroll and caret', () => {
    expect(
      normalizeManuscriptPlace({
        'bk-1': { scrollTop: 420, blockId: 'p-9', selectionStart: 3, selectionEnd: 8 },
        'bk-2': { scrollTop: 'nope' },
        'bk-3': null,
      }),
    ).toEqual({
      'bk-1': { scrollTop: 420, blockId: 'p-9', selectionStart: 3, selectionEnd: 8 },
      'bk-2': { scrollTop: 0 },
    });
  });

  it('accepts appearance values and rejects junk', () => {
    expect(normalizeThemeMode('light', 'dark')).toBe('light');
    expect(normalizeThemeMode('sepia', 'dark')).toBe('dark');
    expect(normalizeThemeId('horror', 'auto')).toBe('horror');
    expect(normalizeThemeId('pastel', 'auto')).toBe('auto');
    expect(isAppTab('dictate')).toBe(true);
    expect(isAppTab('settings')).toBe(false);
  });

  it('drops a deleted book from session maps', () => {
    expect(omitKey({ 'bk-1': 'draft', 'bk-2': 'keep' }, 'bk-1')).toEqual({ 'bk-2': 'keep' });
  });
});
