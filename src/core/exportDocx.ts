import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from 'docx';
import type { Manuscript } from './types';
import type { ExportContext } from './export';
import type { ExportImageBytes } from './manuscriptMedia';
import { styledSpans } from './richText';

function docxImageType(mime: string): 'png' | 'jpg' | 'gif' | null {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/gif') return 'gif';
  return null;
}

function paragraphRuns(text: string, marks: Manuscript['blocks'][number]['marks']) {
  if (!marks?.length) return [new TextRun(text)];
  return styledSpans(text, marks).map(
    (span) =>
      new TextRun({
        text: span.text,
        bold: span.bold || undefined,
        italics: span.italic || undefined,
        strike: span.strike || undefined,
        underline: span.underline ? { type: UnderlineType.SINGLE } : undefined,
      }),
  );
}

function imageParagraphs(info: ExportImageBytes, fallback: string): Paragraph[] {
  const type = docxImageType(info.mime);
  const caption = info.caption?.trim();
  const alt = info.alt?.trim() || caption || fallback;
  const out: Paragraph[] = [];
  if (type && info.bytes.byteLength) {
    const maxW = 480;
    const w = Math.max(1, info.width ?? maxW);
    const h = Math.max(1, info.height ?? Math.round(maxW * 0.75));
    const scale = Math.min(1, maxW / w);
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type,
            data: info.bytes,
            transformation: {
              width: Math.max(1, Math.round(w * scale)),
              height: Math.max(1, Math.round(h * scale)),
            },
            altText: { title: alt, description: alt, name: alt },
          }),
        ],
      }),
    );
  } else {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `[image: ${fallback}]`, italics: true })],
      }),
    );
  }
  if (caption) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: caption, italics: true })],
      }),
    );
  }
  return out;
}

function docxTable(block: Manuscript['blocks'][number]): Table | null {
  const rows = block.table?.rows ?? [];
  if (!rows.length) return null;
  const cols = Math.max(0, ...rows.map((r) => r.length));
  if (cols === 0) return null;
  const width = Math.max(720, Math.floor(9360 / cols));
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    rows: rows.map(
      (row) =>
        new TableRow({
          children: Array.from({ length: cols }, (_, i) => {
            const text = row[i]?.text ?? '';
            return new TableCell({
              width: { size: width, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun(text)] })],
            });
          }),
        }),
    ),
  });
}

/** Build a Word-compatible .docx Document from the manuscript. */
export function buildDocx(m: Manuscript, ctx: ExportContext): Document {
  const children: Array<Paragraph | Table> = [
    new Paragraph({ text: ctx.title, heading: HeadingLevel.TITLE }),
  ];
  if (ctx.author) {
    children.push(
      new Paragraph({ children: [new TextRun({ text: `by ${ctx.author}`, italics: true })] }),
    );
  }

  let chapterNo = 0;
  for (const b of m.blocks) {
    switch (b.type) {
      case 'chapter':
        chapterNo++;
        children.push(
          new Paragraph({
            text: b.title?.trim() || `Chapter ${chapterNo}`,
            heading: HeadingLevel.HEADING_1,
            pageBreakBefore: true,
          }),
        );
        break;
      case 'section':
        children.push(
          new Paragraph({ text: b.title?.trim() || 'Section', heading: HeadingLevel.HEADING_2 }),
        );
        break;
      case 'scene':
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun(b.title?.trim() || ctx.genre.sceneBreakGlyph)],
          }),
        );
        break;
      case 'paragraph':
        if ((b.text ?? '').trim()) {
          children.push(
            new Paragraph({
              children: paragraphRuns(b.text ?? '', b.marks),
              indent: { firstLine: 720 },
            }),
          );
        }
        break;
      case 'image': {
        const info = b.image ? ctx.images?.[b.image.mediaId] : undefined;
        const fallback =
          b.image?.caption?.trim() || b.image?.alt?.trim() || b.title?.trim() || 'Illustration';
        if (info) children.push(...imageParagraphs(info, fallback));
        else {
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: `[image: ${fallback}]`, italics: true })],
            }),
          );
        }
        break;
      }
      case 'table': {
        const table = docxTable(b);
        if (table) children.push(table);
        break;
      }
    }
  }

  return new Document({ sections: [{ children }] });
}

export async function docxToBlob(m: Manuscript, ctx: ExportContext): Promise<Blob> {
  return Packer.toBlob(buildDocx(m, ctx));
}
