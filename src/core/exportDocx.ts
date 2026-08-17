import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import type { Manuscript } from './types';
import type { ExportContext } from './export';

/** Build a Word-compatible .docx Document from the manuscript. */
export function buildDocx(m: Manuscript, ctx: ExportContext): Document {
  const children: Paragraph[] = [
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
          children.push(new Paragraph({ text: b.text!.trim(), indent: { firstLine: 720 } }));
        }
        break;
    }
  }

  return new Document({ sections: [{ children }] });
}

export async function docxToBlob(m: Manuscript, ctx: ExportContext): Promise<Blob> {
  return Packer.toBlob(buildDocx(m, ctx));
}
