/**
 * SpeakFiction blocks stay the manuscript the dictation pipeline edits.
 * The Humanuscript editor reads and writes a document view of those blocks
 * plus certification. Round-trip keeps media-store images and table cell marks.
 */

import { isManuscriptImageMime } from '../core/manuscriptMedia';
import type { Block, Manuscript, ManuscriptTable, TableCell } from '../core/types';
import type { ManuscriptDocument } from './document';
import { emptyDocument } from './document';
import type { ManuscriptCertification } from './state';
import { isManuscriptFontId, isManuscriptFontSize } from './typography';
import type { ManuscriptBlock } from './types';

export function documentFromManuscript(manuscript: Manuscript, manuscriptId: string, title: string): ManuscriptDocument {
  const cert = manuscript.certification;
  const doc = emptyDocument(manuscriptId);
  doc.title = title;
  doc.blocks = manuscript.blocks.map(toEditorBlock);
  doc.provenance = cert?.provenance ?? {};
  doc.points = cert?.points ?? [];
  doc.moves = cert?.moves ?? [];
  if (cert?.fontFamily && isManuscriptFontId(cert.fontFamily)) doc.fontFamily = cert.fontFamily;
  if (cert?.fontSize && isManuscriptFontSize(cert.fontSize)) doc.fontSize = cert.fontSize;
  return doc;
}

export function manuscriptFromDocument(doc: ManuscriptDocument, previous: Block[] = []): Manuscript {
  const prevById = new Map(previous.map((block) => [block.id, block]));
  const certification: ManuscriptCertification = {
    provenance: doc.provenance,
    points: doc.points,
    moves: doc.moves,
  };
  if (doc.fontFamily) certification.fontFamily = doc.fontFamily;
  if (doc.fontSize) certification.fontSize = doc.fontSize;
  return {
    blocks: doc.blocks.map((block) => toSpeakFictionBlock(block, prevById.get(block.id))),
    certification,
  };
}

function toEditorBlock(block: Block): ManuscriptBlock {
  const next: ManuscriptBlock = {
    id: block.id,
    type: block.type,
    title: block.title ?? '',
    text: block.text ?? '',
    marks: block.marks ?? [],
    listStyle: block.listStyle ?? null,
    indentLevel: block.indentLevel ?? 0,
  };
  if (block.type === 'table') {
    next.tableRows = (block.table?.rows ?? []).map((row) => row.map((cell) => cell.text ?? ''));
  }
  if (block.type === 'image') {
    next.imageSrc = block.imageDataUrl ?? '';
    next.imageAlt = block.image?.alt ?? '';
    next.imageCaption = block.image?.caption ?? block.title ?? '';
    next.mediaId = block.image?.mediaId;
    next.imageMime = block.image?.mime;
  }
  if (block.type === 'divider') next.dividerStyle = block.dividerStyle ?? 'scene';
  return next;
}

function toSpeakFictionBlock(block: ManuscriptBlock, prev?: Block): Block {
  const next: Block = {
    id: block.id,
    type: block.type,
    title: block.title,
    text: block.text,
    marks: block.marks?.length ? block.marks : undefined,
  };
  if (block.listStyle) next.listStyle = block.listStyle;
  if (block.indentLevel) next.indentLevel = block.indentLevel;
  if (block.type === 'divider') next.dividerStyle = block.dividerStyle ?? 'scene';
  if (block.type === 'table') next.table = tableFromRows(block.tableRows ?? [], prev?.table);
  if (block.type === 'image') {
    if (block.imageSrc) next.imageDataUrl = block.imageSrc;
    else if (prev?.imageDataUrl) next.imageDataUrl = prev.imageDataUrl;
    if (block.mediaId || prev?.image) {
      const mime = block.imageMime ?? prev?.image?.mime;
      if (block.mediaId && isManuscriptImageMime(mime)) {
        next.image = {
          mediaId: block.mediaId,
          mime,
          alt: block.imageAlt || prev?.image?.alt,
          caption: block.imageCaption ?? prev?.image?.caption,
          width: prev?.image?.width,
          height: prev?.image?.height,
        };
      } else if (prev?.image && !block.imageSrc) {
        next.image = {
          ...prev.image,
          alt: block.imageAlt || prev.image.alt,
          caption: block.imageCaption ?? prev.image.caption,
        };
      }
    }
    if (block.imageCaption != null) next.title = block.imageCaption;
  }
  return next;
}

function tableFromRows(rows: string[][], previous?: ManuscriptTable): ManuscriptTable {
  const grid: TableCell[][] = rows.map((row, ri) =>
    row.map((text, ci) => {
      const prior = previous?.rows[ri]?.[ci];
      if (prior && prior.text === text) return prior;
      return { text };
    }),
  );
  return { rows: grid };
}
