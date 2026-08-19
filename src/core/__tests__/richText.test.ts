import { describe, expect, it } from 'vitest';
import {
  applyMark,
  clearFormatting,
  migratePlainText,
  rangeHasMark,
  splitMarkedText,
  styledSpans,
  textToHtml,
  toggleMark,
} from '../richText';
import { MAX_IMAGE_BYTES, validateImageBytes } from '../manuscriptMedia';

describe('plain text migration', () => {
  it('reads legacy paragraph strings as unmarked text', () => {
    expect(migratePlainText('The wind howled.')).toEqual({
      text: 'The wind howled.',
      marks: [],
    });
    expect(migratePlainText(undefined)).toEqual({ text: '', marks: [] });
  });
});

describe('inline marks', () => {
  it('applies, toggles, and clears bold italic underline', () => {
    const text = 'The wind howled.';
    const bold = applyMark([], 4, 8, 'bold', text.length);
    expect(rangeHasMark(bold, 4, 8, 'bold')).toBe(true);
    const both = applyMark(bold, 4, 8, 'italic', text.length);
    expect(styledSpans(text, both)[1]).toMatchObject({
      text: 'wind',
      bold: true,
      italic: true,
    });
    const unbold = toggleMark(both, 4, 8, 'bold', text.length);
    expect(rangeHasMark(unbold, 4, 8, 'bold')).toBe(false);
    expect(rangeHasMark(unbold, 4, 8, 'italic')).toBe(true);
    expect(clearFormatting(unbold, 0, text.length, text.length)).toEqual([]);
  });

  it('splits marks with a paragraph at the caret', () => {
    const text = 'Hello. World.';
    const marks = applyMark([], 0, 13, 'italic', text.length);
    const split = splitMarkedText(text, marks, 7);
    expect(split.leftText).toBe('Hello.');
    expect(split.rightText).toBe('World.');
    expect(split.leftMarks).toEqual([{ kind: 'italic', start: 0, end: 6 }]);
    expect(split.rightMarks).toEqual([{ kind: 'italic', start: 0, end: 6 }]);
  });

  it('renders marks as HTML tags', () => {
    const html = textToHtml('Hi', [{ kind: 'bold', start: 0, end: 2 }]);
    expect(html).toBe('<b>Hi</b>');
  });
});

describe('image validation', () => {
  it('accepts png bytes under the cap and rejects empty or huge files', () => {
    expect(validateImageBytes(new Uint8Array([1, 2, 3]), 'image/png')).toEqual({
      ok: true,
      mime: 'image/png',
    });
    expect(validateImageBytes(new Uint8Array(), 'image/png').ok).toBe(false);
    expect(validateImageBytes(new Uint8Array(MAX_IMAGE_BYTES + 1), 'image/jpeg').ok).toBe(false);
    expect(validateImageBytes(new Uint8Array([1]), 'application/pdf').ok).toBe(false);
  });
});
