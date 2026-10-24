/**
 * Typeface and size for one book.
 * Faces are named manuscript fonts. Each stack starts with that face, then
 * substitutes the page can paint without a bundled font file.
 */

import type { ManuscriptDocument } from './document';

export const MANUSCRIPT_FONTS = [
  {
    id: 'palatino',
    label: 'Palatino',
    css: 'Palatino, "Palatino Linotype", "Book Antiqua", "Noto Serif", "Liberation Serif", serif',
    exportName: 'Palatino',
    pdfFont: 'times',
    rtfFamily: '\\froman',
  },
  {
    id: 'georgia',
    label: 'Georgia',
    css: 'Georgia, "Noto Serif", "Liberation Serif", serif',
    exportName: 'Georgia',
    pdfFont: 'times',
    rtfFamily: '\\froman',
  },
  {
    id: 'times',
    label: 'Times New Roman',
    css: '"Times New Roman", Times, Tinos, "Liberation Serif", serif',
    exportName: 'Times New Roman',
    pdfFont: 'times',
    rtfFamily: '\\froman',
  },
  {
    id: 'garamond',
    label: 'Garamond',
    css: 'Garamond, "EB Garamond", "Palatino Linotype", "Noto Serif", serif',
    exportName: 'Garamond',
    pdfFont: 'times',
    rtfFamily: '\\froman',
  },
  {
    id: 'courier',
    label: 'Courier',
    css: '"Courier New", Courier, Cousine, "Liberation Mono", monospace',
    exportName: 'Courier New',
    pdfFont: 'courier',
    rtfFamily: '\\fmodern',
  },
  {
    id: 'arial',
    label: 'Arial',
    css: 'Arial, Helvetica, Arimo, "Liberation Sans", sans-serif',
    exportName: 'Arial',
    pdfFont: 'helvetica',
    rtfFamily: '\\fswiss',
  },
] as const;

export type ManuscriptFontId = (typeof MANUSCRIPT_FONTS)[number]['id'];
export type ManuscriptFont = (typeof MANUSCRIPT_FONTS)[number];

export const DEFAULT_MANUSCRIPT_FONT_ID: ManuscriptFontId = 'palatino';
/** Body size in points. 12pt is the usual manuscript measure. */
export const DEFAULT_MANUSCRIPT_FONT_SIZE = 12;

/** Point sizes offered in the formatting bar. */
export const MANUSCRIPT_FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 22, 24] as const;

const FONT_BY_ID = new Map<string, ManuscriptFont>(MANUSCRIPT_FONTS.map((font) => [font.id, font]));
const SIZE_SET = new Set<number>(MANUSCRIPT_FONT_SIZES);

export function isManuscriptFontId(value: unknown): value is ManuscriptFontId {
  return typeof value === 'string' && FONT_BY_ID.has(value);
}

export function isManuscriptFontSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && SIZE_SET.has(value);
}

export interface ManuscriptTypography {
  font: ManuscriptFont;
  sizePt: number;
}

export function resolveManuscriptTypography(doc: {
  fontFamily?: string;
  fontSize?: number;
}): ManuscriptTypography {
  const font = (doc.fontFamily && FONT_BY_ID.get(doc.fontFamily)) || FONT_BY_ID.get(DEFAULT_MANUSCRIPT_FONT_ID)!;
  return {
    font,
    sizePt: isManuscriptFontSize(doc.fontSize) ? doc.fontSize : DEFAULT_MANUSCRIPT_FONT_SIZE,
  };
}

/** CSS custom properties for the manuscript surface. */
export function manuscriptTypographyStyle(doc: {
  fontFamily?: string;
  fontSize?: number;
}): { '--ms-font': string; '--ms-size': string } {
  const { font, sizePt } = resolveManuscriptTypography(doc);
  return {
    '--ms-font': font.css,
    '--ms-size': `${sizePt}pt`,
  };
}

/**
 * Record a face or size on the book. The text, provenance, and certification
 * points stay as they are — this is not an insertion.
 */
export function setManuscriptTypography(
  doc: ManuscriptDocument,
  patch: { fontFamily?: string; fontSize?: number },
): ManuscriptDocument {
  const current = resolveManuscriptTypography(doc);
  const font = patch.fontFamily !== undefined
    ? FONT_BY_ID.get(patch.fontFamily) ?? current.font
    : current.font;
  const sizePt = patch.fontSize !== undefined && isManuscriptFontSize(patch.fontSize)
    ? patch.fontSize
    : current.sizePt;
  if (current.font.id === font.id && current.sizePt === sizePt) return doc;
  return { ...doc, fontFamily: font.id, fontSize: sizePt };
}
