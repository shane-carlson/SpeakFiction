import type { Block, GenreProfile, Manuscript } from './types';

export interface ExportContext {
  title: string;
  author?: string;
  genre: GenreProfile;
}

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

/**
 * RTF export. Word and Scrivener both import RTF natively, so this is the
 * shared format for the guided desktop integrations.
 */
export function toRtf(m: Manuscript, ctx: ExportContext): string {
  const parts: string[] = [
    '{\\rtf1\\ansi\\ansicpg1252\\deff0',
    '{\\fonttbl{\\f0 Times New Roman;}}',
    `\\f0\\fs24 {\\b\\fs40 ${rtfEscape(ctx.title)}\\par}`,
  ];
  if (ctx.author) parts.push(`{\\i by ${rtfEscape(ctx.author)}\\par}`);
  parts.push('\\par');

  let chapterNo = 0;
  for (const b of m.blocks) {
    switch (b.type) {
      case 'chapter':
        chapterNo++;
        parts.push(`\\page{\\b\\fs32 ${rtfEscape(chapterHeading(b, chapterNo))}\\par}\\par`);
        break;
      case 'section':
        parts.push(`{\\b\\fs28 ${rtfEscape(b.title?.trim() || 'Section')}\\par}\\par`);
        break;
      case 'scene':
        parts.push(`\\qc ${rtfEscape(b.title?.trim() || ctx.genre.sceneBreakGlyph)}\\par\\ql\\par`);
        break;
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
