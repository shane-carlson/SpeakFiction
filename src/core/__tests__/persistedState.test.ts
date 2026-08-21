import { describe, expect, it } from 'vitest';
import {
  isAppTab,
  normalizeDictationDrafts,
  normalizeLastSeenVersion,
  normalizeManuscriptEditorOpen,
  normalizeManuscriptPlace,
  normalizeThemeId,
  normalizeThemeMode,
  omitKey,
  persistSnapshotIndicatesPriorSession,
} from '../persistedState';

describe('persisted session fields', () => {
  it('keeps dictation drafts keyed by book id', () => {
    expect(normalizeDictationDrafts({ 'bk-1': 'new chapter period', 'bk-2': 9 })).toEqual({
      'bk-1': [{ text: 'new chapter period', struck: false }],
    });
    expect(normalizeDictationDrafts(null)).toEqual({});
  });

  it('round-trips struck spans in the dictation box and migrates old strings', () => {
    expect(
      normalizeDictationDrafts({
        'bk-1': [
          { text: 'Hello. ', struck: false },
          { text: 'World.', struck: true },
        ],
      }),
    ).toEqual({
      'bk-1': [
        { text: 'Hello. ', struck: false },
        { text: 'World.', struck: true },
      ],
    });
  });

  it('keeps manuscript scroll, caret, and insert gap', () => {
    expect(
      normalizeManuscriptPlace({
        'bk-1': { scrollTop: 420, blockId: 'p-9', selectionStart: 3, selectionEnd: 8 },
        'bk-2': { scrollTop: 'nope' },
        'bk-3': null,
        'bk-4': { scrollTop: 12, atIndex: 2 },
      }),
    ).toEqual({
      'bk-1': { scrollTop: 420, blockId: 'p-9', selectionStart: 3, selectionEnd: 8 },
      'bk-2': { scrollTop: 0 },
      'bk-4': { scrollTop: 12, atIndex: 2 },
    });
  });

  it('accepts appearance values and rejects junk', () => {
    expect(normalizeThemeMode('light', 'dark')).toBe('light');
    expect(normalizeThemeMode('sepia', 'dark')).toBe('dark');
    expect(normalizeThemeId('horror', 'auto')).toBe('horror');
    expect(normalizeThemeId('romance', 'auto')).toBe('romance');
    expect(normalizeThemeId('queer-lit', 'auto')).toBe('queer-lit');
    expect(normalizeThemeId('ya', 'auto')).toBe('ya');
    expect(normalizeThemeId('pastel', 'auto')).toBe('auto');
    expect(isAppTab('dictate')).toBe(true);
    expect(isAppTab('settings')).toBe(false);
    expect(normalizeLastSeenVersion('0.1.6-b11')).toBe('0.1.6-b11');
    expect(normalizeLastSeenVersion('')).toBe(null);
    expect(normalizeManuscriptEditorOpen(true)).toBe(true);
    expect(normalizeManuscriptEditorOpen(undefined)).toBe(false);
    expect(normalizeManuscriptEditorOpen('yes')).toBe(false);
  });

  it('treats persisted library JSON as a prior session, not a first install', () => {
    expect(persistSnapshotIndicatesPriorSession(null)).toBe(false);
    expect(persistSnapshotIndicatesPriorSession('')).toBe(false);
    expect(persistSnapshotIndicatesPriorSession('{not json')).toBe(false);
    expect(
      persistSnapshotIndicatesPriorSession({
        state: { books: [{ id: 'bk-1', title: 'Draft' }] },
        version: 4,
      }),
    ).toBe(true);
    expect(
      persistSnapshotIndicatesPriorSession(
        JSON.stringify({ state: { books: [{ id: 'bk-1' }] }, version: 3 }),
      ),
    ).toBe(true);
    expect(persistSnapshotIndicatesPriorSession({ books: [{ id: 'bk-1' }] })).toBe(true);
    expect(persistSnapshotIndicatesPriorSession({ state: { books: [] }, version: 4 })).toBe(true);
    expect(persistSnapshotIndicatesPriorSession({ themeMode: 'dark' })).toBe(false);
  });

  it('drops a deleted book from session maps', () => {
    expect(omitKey({ 'bk-1': 'draft', 'bk-2': 'keep' }, 'bk-1')).toEqual({ 'bk-2': 'keep' });
  });
});
