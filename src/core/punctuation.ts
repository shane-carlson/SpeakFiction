import type { GenreProfile } from './types';

/**
 * Convert spoken punctuation commands and apply genre-specific typographic
 * conventions. Follows the standard dictation convention where words like
 * "period" and "comma" are treated as punctuation commands.
 */

const DASH = { em: '\u2014', en: '\u2013', hyphen: '-' } as const;

/** Multi-word commands, applied before single-word ones. */
const MULTI_WORD: Array<[RegExp, string]> = [
  [/\bexclamation (?:point|mark)\b/gi, '!'],
  [/\bquestion mark\b/gi, '?'],
  [/\bopen quote\b/gi, '\uE000OPENQ\uE000'],
  [/\b(?:close|end) quote\b/gi, '\uE000CLOSEQ\uE000'],
  [/\bopen (?:paren|parenthesis)\b/gi, '\uE000OPENP\uE000'],
  [/\b(?:close|end) (?:paren|parenthesis)\b/gi, '\uE000CLOSEP\uE000'],
  [/\bdot dot dot\b/gi, '\u2026'],
];

const SINGLE_WORD: Array<[RegExp, string]> = [
  [/\bperiod\b/gi, '.'],
  [/\bfull stop\b/gi, '.'],
  [/\bcomma\b/gi, ','],
  [/\bsemicolon\b/gi, ';'],
  [/\bcolon\b/gi, ':'],
  [/\bellipsis\b/gi, '\u2026'],
  [/\bunquote\b/gi, '\uE000CLOSEQ\uE000'],
  [/\bquote\b/gi, '\uE000OPENQ\uE000'],
  [/\bdash\b/gi, '\uE000DASH\uE000'],
];

function applyQuotes(text: string, profile: GenreProfile): string {
  if (profile.quoteStyle === 'curly') {
    return text
      .replace(/\uE000OPENQ\uE000\s*/g, '\u201C')
      .replace(/\s*\uE000CLOSEQ\uE000/g, '\u201D');
  }
  return text
    .replace(/\uE000OPENQ\uE000\s*/g, '"')
    .replace(/\s*\uE000CLOSEQ\uE000/g, '"');
}

/** Insert the serial comma in "a, b and c" -> "a, b, and c". */
function applyOxfordComma(text: string): string {
  return text.replace(/,\s+([^,]+?)\s+and\s+/g, ', $1, and ');
}

function fixSpacing(text: string): string {
  return text
    // no space before closing punctuation
    .replace(/\s+([.,;:!?])/g, '$1')
    // no space before closing paren/quote handled via markers already
    .replace(/\uE000OPENP\uE000\s*/g, '(')
    .replace(/\s*\uE000CLOSEP\uE000/g, ')')
    // collapse duplicate spaces
    .replace(/[ \t]{2,}/g, ' ')
    // ensure a single space after sentence punctuation when followed by a word
    .replace(/([.,;:!?])([A-Za-z\u201C"'(])/g, '$1 $2')
    .trim();
}

/** Capitalize the first letter of each sentence. */
export function capitalizeSentences(text: string): string {
  let out = text.replace(/(^|[.!?]\s+|\u201C|")\s*([a-z])/g, (_m, pre: string, ch: string) => {
    return pre + ch.toUpperCase();
  });
  // Capitalize the standalone pronoun "i".
  out = out.replace(/\bi\b/g, 'I').replace(/\bi'/g, "I'");
  return out;
}

export function applyPunctuation(text: string, profile: GenreProfile): string {
  let out = ` ${text} `;

  for (const [re, rep] of MULTI_WORD) out = out.replace(re, rep);
  for (const [re, rep] of SINGLE_WORD) out = out.replace(re, rep);

  out = out.replace(/\uE000DASH\uE000/g, DASH[profile.dashStyle]);

  if (profile.useEllipsisGlyph) {
    out = out.replace(/\.\.\./g, '\u2026');
  } else {
    out = out.replace(/\u2026/g, '...');
  }

  out = applyQuotes(out, profile);
  out = fixSpacing(out);
  if (profile.oxfordComma) out = applyOxfordComma(out);
  out = capitalizeSentences(out);

  return out.trim();
}
