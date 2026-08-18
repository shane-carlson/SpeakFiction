import { describe, expect, it } from 'vitest';
import { isThemeId, resolveThemeId, themeDisplayName } from '../theme';

describe('resolveThemeId', () => {
  it('follows the book genre when themeId is auto', () => {
    expect(resolveThemeId('auto', 'fantasy')).toBe('fantasy');
    expect(resolveThemeId('auto', 'horror')).toBe('horror');
  });

  it('falls back to generic when auto and the book genre is missing', () => {
    expect(resolveThemeId('auto', undefined)).toBe('generic');
    expect(resolveThemeId('auto', 'nope' as 'fantasy')).toBe('generic');
  });

  it('keeps an explicit override even when the book genre differs', () => {
    expect(resolveThemeId('literary', 'fantasy')).toBe('literary');
    expect(resolveThemeId('sci-fi', 'romance')).toBe('sci-fi');
  });
});

describe('themeDisplayName', () => {
  it('marks auto as following the book', () => {
    expect(themeDisplayName('auto', 'fantasy')).toBe('Fantasy (book)');
    expect(themeDisplayName('horror', 'horror')).toBe('Horror');
  });
});

describe('isThemeId', () => {
  it('accepts auto and known genres only', () => {
    expect(isThemeId('auto')).toBe(true);
    expect(isThemeId('ya')).toBe(true);
    expect(isThemeId('sci-fi')).toBe(true);
    expect(isThemeId('pastel')).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
  });
});
