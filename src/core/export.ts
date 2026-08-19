import type { Block, GenreProfile, Manuscript } from './types';
import { markedToMarkdown, markedToRtf } from './richText';
import { bytesToBase64, type ExportImageBytes } from './manuscriptMedia';

export interface ExportContext {
  title: string;
  author?: string;
  genre: GenreProfile;
  /** Binary pictures keyed by mediaId. Omit when exporting without images. */
  images?: Record<string, ExportImageBytes>;
}

/**
 * Line-only separator for Scrivener 3 File → Import → Import and Split…
 * A paragraph that contains only this string is removed and starts a new binder document.
 */
export const SCRIVENER_SPLIT_SEPARATOR = '#';

function chapterHeading(block: Block, index: number): string {
  return block.title?.trim() || `Chapter ${index}`;
}

function imageLabel(block: Block, info?: ExportImageBytes): string {
  return (
    info?.caption?.trim() ||
    info?.alt?.trim() ||
    block.image?.caption?.trim() ||
    block.image?.alt?.trim() ||
    block.title?.trim() ||
    'Illustration'
  );
}

function paragraphMarkdown(block: Block): string | null {
  const raw = block.text ?? '';
  if (!raw.trim()) return null;
  if (block.marks?.length) return markedToMarkdown(raw, block.marks);
  return raw.trim();
}

function imageMarkdown(block: Block, ctx: ExportContext): string {
  const info = block.image ? ctx.images?.[block.image.mediaId] : undefined;
  const alt = imageLabel(block, info);
  const caption = info?.caption?.trim() || block.image?.caption?.trim();
  let figure = `![${alt}]`;
  if (info?.bytes?.byteLength) {
    figure = `![${alt}](data:${info.mime};base64,${bytesToBase64(info.bytes)})`;
  } else if (block.image) {
    figure = `![${alt}](images/${block.image.mediaId})`;
  }
  return caption && caption !== alt ? `${figure}\n\n*${caption}*` : figure;
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
      case 'paragraph': {
        const para = paragraphMarkdown(b);
        if (para) lines.push(para, '');
        break;
      }
      case 'image':
        lines.push('', imageMarkdown(b, ctx), '');
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
      case 'image':
        lines.push('', `[image: ${imageLabel(b, b.image ? ctx.images?.[b.image.mediaId] : undefined)}]`, '');
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

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

function rtfBlip(mime: string): 'jpegblip' | 'pngblip' | null {
  if (mime === 'image/jpeg') return 'jpegblip';
  if (mime === 'image/png') return 'pngblip';
  return null;
}

function rtfPict(info: ExportImageBytes, fallback: string): string {
  const blip = rtfBlip(info.mime);
  if (!blip || !info.bytes.byteLength) {
    return `\\pard\\qc ${rtfEscape(`[image: ${fallback}]`)}\\par\\pard\\ql`;
  }
  const maxTwips = 8640;
  const w = Math.max(1, info.width ?? 480);
  const h = Math.max(1, info.height ?? 360);
  const pxToTwips = 15;
  const scale = Math.min(1, maxTwips / (w * pxToTwips));
  const picw = Math.max(1, Math.round(w * pxToTwips * scale));
  const pich = Math.max(1, Math.round(h * pxToTwips * scale));
  return `\\pard\\qc {\\pict\\${blip}\\picwgoal${picw}\\pichgoal${pich} ${bytesToHex(info.bytes)}}\\par\\pard\\ql`;
}

function paragraphRtf(block: Block): string | null {
  const raw = block.text ?? '';
  if (!raw.trim()) return null;
  if (block.marks?.length) return `\\fi720 ${markedToRtf(raw, block.marks)}\\par`;
  return `\\fi720 ${rtfEscape(raw.trim())}\\par`;
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
      case 'paragraph': {
        const para = paragraphRtf(b);
        if (para) parts.push(para);
        break;
      }
      case 'image': {
        const info = b.image ? ctx.images?.[b.image.mediaId] : undefined;
        const label = imageLabel(b, info);
        if (info) parts.push(rtfPict(info, label));
        else parts.push(`\\pard\\qc ${rtfEscape(`[image: ${label}]`)}\\par\\pard\\ql`);
        const caption = info?.caption?.trim() || b.image?.caption?.trim();
        if (caption) parts.push(`\\pard\\qc{\\i ${rtfEscape(caption)}\\par}\\pard\\ql`);
        break;
      }
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
