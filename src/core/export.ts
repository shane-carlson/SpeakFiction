import type { Block, GenreProfile, Manuscript } from './types';

export interface ExportContext {
  title: string;
  author?: string;
  genre: GenreProfile;
}

/**
 * Line-only separator for Scrivener 3 File → Import → Import and Split…
 * A paragraph that contains only this string is removed and starts a new binder document.
 */
export const SCRIVENER_SPLIT_SEPARATOR = '#';

function chapterHeading(block: Block, index: number): string {
  return block.title?.trim() || `Chapter ${index}`;
}

/** Markdown export. Chapters/sections use headings; scenes use a break glyph. */
export function toMarkdown(m: Manuscript, ctx: ExportContext): string {
  const lines: string[] = [`# ${ctx.title}`];
  if (ctx.author) lines.push(`_by ${ctx.author}_`);
  lines.push('');

  let chapterNo = 0;
  for (const b of m.blocks) {
    switch (b.type) {
      case 'chapter':
        chapterNo++;
        lines.push('', `## ${chapterHeading(b, chapterNo)}`, '');
        break;
      case 'section':
        lines.push('', `### ${b.title?.trim() || 'Section'}`, '');
        break;
      case 'scene':
        lines.push('', b.title?.trim() ? `**${b.title.trim()}**` : ctx.genre.sceneBreakGlyph, '');
        break;
      case 'paragraph':
        if ((b.text ?? '').trim()) lines.push(b.text!.trim(), '');
        break;
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function toPlainText(m: Manuscript, ctx: ExportContext): string {
  const lines: string[] = [ctx.title.toUpperCase()];
  if (ctx.author) lines.push(`by ${ctx.author}`);
  lines.push('');

  let chapterNo = 0;
  for (const b of m.blocks) {
    switch (b.type) {
      case 'chapter':
        chapterNo++;
        lines.push('', chapterHeading(b, chapterNo).toUpperCase(), '');
        break;
      case 'section':
        lines.push('', (b.title?.trim() || 'Section'), '');
        break;
      case 'scene':
        lines.push('', ctx.genre.sceneBreakGlyph, '');
        break;
      case 'paragraph':
        if ((b.text ?? '').trim()) lines.push(b.text!.trim(), '');
        break;
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function rtfEscape(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ch === '\\' || ch === '{' || ch === '}') out += '\\' + ch;
    else if (code > 127) out += `\\u${code}?`;
    else out += ch;
  }
  return out;
}

function rtfSplitDelimiter(): string {
  return `\\pard ${rtfEscape(SCRIVENER_SPLIT_SEPARATOR)}\\par`;
}

/**
 * RTF export. Scrivener 3 Import and Split uses a line that is only `#`
 * (see SCRIVENER_SPLIT_SEPARATOR). Chapter titles follow on the next line
 * so they become binder document names. Scenes stay inside the chapter.
 * Pass `{ chapterSplit: false }` for live paste into an open document.
 */
export function toRtf(
  m: Manuscript,
  ctx: ExportContext,
  opts: { chapterSplit?: boolean } = {},
): string {
  const chapterSplit = opts.chapterSplit !== false;
  const parts: string[] = [
    '{\\rtf1\\ansi\\ansicpg1252\\deff0',
    '{\\fonttbl{\\f0 Times New Roman;}}',
    '\\f0\\fs24',
  ];

  let chapterNo = 0;
  for (const b of m.blocks) {
    switch (b.type) {
      case 'chapter':
        chapterNo++;
        if (chapterSplit) parts.push(rtfSplitDelimiter());
        parts.push(`\\pard{\\b\\fs32 ${rtfEscape(chapterHeading(b, chapterNo))}\\par}\\pard\\par`);
        break;
      case 'section':
        parts.push(`\\pard{\\b\\fs28 ${rtfEscape(b.title?.trim() || 'Section')}\\par}\\pard\\par`);
        break;
      case 'scene': {
        const label = b.title?.trim()
          ? `${ctx.genre.sceneBreakGlyph}  ${b.title.trim()}`
          : ctx.genre.sceneBreakGlyph;
        parts.push(`\\pard\\qc ${rtfEscape(label)}\\par\\pard\\ql\\par`);
        break;
      }
      case 'paragraph':
        if ((b.text ?? '').trim()) parts.push(`\\fi720 ${rtfEscape(b.text!.trim())}\\par`);
        break;
    }
  }
  parts.push('}');
  return parts.join('\n');
}

/**
 * A single manuscript can be split by Scrivener on import using chapter
 * markers. We emit RTF plus a companion outline the guided importer reads.
 */
export interface ScrivenerBundle {
  rtf: string;
  outline: Array<{ level: number; kind: Block['type']; title: string }>;
}

export function toScrivener(m: Manuscript, ctx: ExportContext): ScrivenerBundle {
  const outline: ScrivenerBundle['outline'] = [];
  let chapterNo = 0;
  for (const b of m.blocks) {
    if (b.type === 'chapter') {
      chapterNo++;
      outline.push({ level: 1, kind: 'chapter', title: chapterHeading(b, chapterNo) });
    } else if (b.type === 'scene') {
      outline.push({ level: 2, kind: 'scene', title: b.title?.trim() || 'Scene' });
    } else if (b.type === 'section') {
      outline.push({ level: 2, kind: 'section', title: b.title?.trim() || 'Section' });
    }
  }
  return { rtf: toRtf(m, ctx), outline };
}
