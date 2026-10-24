/**
 * Manuscript document: Speak Fiction blocks plus certification points.
 * Text edits go through the provenance layer so every span has an origin.
 */

import {
  applyTextChange,
  countOriginWords,
  relocateRange,
  splitSpans,
  stripInvalidKeyboardSeals,
  syncBlockPoints,
  TRUST_STATEMENT,
  type CertificationPoint,
  type InputEvidence,
  type InsertionOrigin,
  type MoveRecord,
  type ProvenanceSpan,
} from './certification';
import {
  chapterOrder,
  dragPreviewLabel,
  emptyBlock,
  findMatches,
  manuscriptStats,
  moveBlockBy,
  moveBlockRange,
  movableRange,
  unwrapHeading,
  type BlockRange,
  type ManuscriptMatch,
} from './manuscript';
import { expandCollapsedRange, toggleMark } from './richText';
import type { ManuscriptFontId } from './typography';
import { isProseBlock, type BlockType, type DividerStyle, type InlineMarkKind, type ManuscriptBlock } from './types';

export interface ManuscriptDocument {
  version: 1;
  manuscriptId: string;
  title: string;
  blocks: ManuscriptBlock[];
  /** Parallel to blocks, by block id. */
  provenance: Record<string, { title: ProvenanceSpan[]; text: ProvenanceSpan[] }>;
  points: CertificationPoint[];
  moves: MoveRecord[];
  /**
   * Typeface for this book. Absent uses the serif default.
   * Changing it is not an insertion and does not touch certification.
   */
  fontFamily?: ManuscriptFontId;
  /** Body size in points. Absent means 12. Not an insertion. */
  fontSize?: number;
}

export interface StoredManuscript extends ManuscriptDocument {
  savedAt: string;
}

export { TRUST_STATEMENT, chapterOrder, dragPreviewLabel, manuscriptStats, movableRange };
export type { BlockRange, CertificationPoint, InsertionOrigin, MoveRecord, ProvenanceSpan };

export function emptyDocument(manuscriptId: string): ManuscriptDocument {
  return {
    version: 1,
    manuscriptId,
    title: '',
    blocks: [],
    provenance: {},
    points: [],
    moves: [],
  };
}

/** Reconcile seals after localStorage or hand-edited JSON load. */
export async function reconcileLoadedDocument(
  doc: ManuscriptDocument,
  now: string,
  newId: () => string,
): Promise<ManuscriptDocument> {
  let provenance = doc.provenance;
  let points = doc.points;
  for (const block of doc.blocks) {
    for (const field of ['title', 'text'] as const) {
      if (field === 'text' && !isProseBlock(block.type)) continue;
      if (field === 'title' && isProseBlock(block.type)) continue;
      const text = field === 'title' ? block.title : block.text;
      const spans = await stripInvalidKeyboardSeals({
        text,
        spans: fieldSpans({ ...doc, provenance }, block, field),
        points,
        newId,
      });
      const sealed = await syncBlockPoints({
        blockId: block.id,
        text,
        spans,
        points,
        evidence: null,
        now,
        newId,
      });
      provenance = putSpans({ ...doc, provenance, points: sealed.points }, block.id, field, sealed.spans);
      points = sealed.points;
    }
  }
  return { ...doc, provenance, points };
}

function fieldSpans(doc: ManuscriptDocument, block: ManuscriptBlock, field: 'title' | 'text'): ProvenanceSpan[] {
  return doc.provenance[block.id]?.[field] ?? [];
}

function putSpans(
  doc: ManuscriptDocument,
  blockId: string,
  field: 'title' | 'text',
  spans: ProvenanceSpan[],
): ManuscriptDocument['provenance'] {
  const prev = doc.provenance[blockId] ?? { title: [], text: [] };
  return { ...doc.provenance, [blockId]: { ...prev, [field]: spans } };
}

export function displayTitle(doc: ManuscriptDocument): string {
  const title = doc.title.trim();
  return title || 'Untitled manuscript';
}

export async function editField(args: {
  doc: ManuscriptDocument;
  blockId: string;
  field: 'title' | 'text';
  start: number;
  end: number;
  insert: string;
  origin: InsertionOrigin | null;
  pasteHint?: string;
  event: InputEvidence | null;
  now: string;
  newId: () => string;
}): Promise<ManuscriptDocument> {
  const block = args.doc.blocks.find((b) => b.id === args.blockId);
  if (!block) return args.doc;
  if (args.field === 'title' && isProseBlock(block.type)) return args.doc;
  if (args.field === 'text' && !isProseBlock(block.type)) return args.doc;

  const current = args.field === 'title' ? block.title : block.text;
  const insert = args.field === 'title' ? args.insert.replace(/\r?\n/g, ' ') : args.insert;
  if (args.field === 'text' && insert.includes('\n')) {
    return pasteMultiline({ ...args, insert });
  }

  const changed = applyTextChange({
    text: current,
    spans: fieldSpans(args.doc, block, args.field),
    marks: args.field === 'text' ? block.marks : [],
    start: args.start,
    end: args.end,
    insert,
    origin: args.origin,
    pasteHint: args.pasteHint,
    newId: args.newId,
  });
  const sealed = await syncBlockPoints({
    blockId: block.id,
    text: changed.text,
    spans: changed.spans,
    points: args.doc.points,
    evidence:
      args.event && changed.evidenceSpanIds.length
        ? { spanIds: changed.evidenceSpanIds, event: args.event }
        : null,
    now: args.now,
    newId: args.newId,
  });
  const blocks = args.doc.blocks.map((b) => {
    if (b.id !== block.id) return b;
    if (args.field === 'title') return { ...b, title: changed.text };
    return { ...b, text: changed.text, marks: changed.marks };
  });
  return {
    ...args.doc,
    blocks,
    provenance: putSpans(args.doc, block.id, args.field, sealed.spans),
    points: sealed.points,
  };
}

async function pasteMultiline(args: {
  doc: ManuscriptDocument;
  blockId: string;
  field: 'title' | 'text';
  start: number;
  end: number;
  insert: string;
  origin: InsertionOrigin | null;
  event: InputEvidence | null;
  now: string;
  newId: () => string;
}): Promise<ManuscriptDocument> {
  const lines = args.insert.replace(/\r\n/g, '\n').split('\n');
  const origin = args.origin ?? 'paste';
  let doc = await editField({ ...args, insert: lines[0] ?? '', origin });
  const blockIndex = doc.blocks.findIndex((b) => b.id === args.blockId);
  const block = doc.blocks[blockIndex];
  if (!block || lines.length < 2) return doc;

  const caret = args.start + (lines[0]?.length ?? 0);
  const tail = block.text.slice(caret);
  const tailSpans = splitSpans(doc.provenance[block.id]?.text ?? [], caret, block.text.length, args.newId).right;
  const tailCertIds = new Set(tailSpans.map((span) => span.certificationId).filter((id): id is string => Boolean(id)));
  const retainedPoints = doc.points.filter((p) => tailCertIds.has(p.id));
  const head = await editField({
    doc,
    blockId: block.id,
    field: 'text',
    start: caret,
    end: block.text.length,
    insert: '',
    origin: null,
    event: null,
    now: args.now,
    newId: args.newId,
  });
  doc = head;

  const created: ManuscriptBlock[] = [];
  for (let i = 1; i < lines.length; i++) {
    const id = args.newId();
    const isLast = i === lines.length - 1;
    const text = isLast ? `${lines[i] ?? ''}${tail}` : (lines[i] ?? '');
    created.push({ id, type: 'paragraph', title: '', text, marks: [] });
  }

  let provenance = { ...doc.provenance };
  let points = doc.points;
  for (const point of retainedPoints) {
    if (!points.some((existing) => existing.id === point.id)) points = [...points, point];
  }
  const blocks = [...doc.blocks];
  blocks.splice(blockIndex + 1, 0, ...created);
  for (let i = 0; i < created.length; i++) {
    const createdBlock = created[i]!;
    const line = lines[i + 1] ?? '';
    const isLast = i === created.length - 1;
    const lineChange = applyTextChange({
      text: '',
      spans: [],
      marks: [],
      start: 0,
      end: 0,
      insert: line,
      origin,
      newId: args.newId,
    });
    let spans = lineChange.spans;
    if (isLast && tail) {
      const shifted = tailSpans.map((span) => ({
        ...span,
        start: span.start + line.length,
        end: span.end + line.length,
      }));
      spans = [...spans, ...shifted];
    }
    const sealed = await syncBlockPoints({
      blockId: createdBlock.id,
      text: createdBlock.text,
      spans,
      points,
      evidence:
        args.event && line
          ? { spanIds: spans.filter((s) => s.origin === 'keyboard' || s.origin === 'dictation').map((s) => s.id), event: args.event }
          : null,
      now: args.now,
      newId: args.newId,
    });
    provenance = { ...provenance, [createdBlock.id]: { title: [], text: sealed.spans } };
    points = sealed.points;
  }
  return prunePoints({ ...doc, blocks, provenance, points });
}

function prunePoints(doc: ManuscriptDocument): ManuscriptDocument {
  const live = new Set<string>();
  for (const block of doc.blocks) {
    const prov = doc.provenance[block.id];
    for (const span of [...(prov?.title ?? []), ...(prov?.text ?? [])]) {
      if (span.certificationId) live.add(span.certificationId);
    }
  }
  return { ...doc, points: doc.points.filter((point) => live.has(point.id)) };
}

export async function splitParagraph(args: {
  doc: ManuscriptDocument;
  blockId: string;
  offset: number;
  now: string;
  newId: () => string;
}): Promise<ManuscriptDocument> {
  const index = args.doc.blocks.findIndex((b) => b.id === args.blockId);
  const block = args.doc.blocks[index];
  if (!block) return args.doc;
  if (!isProseBlock(block.type)) {
    const id = args.newId();
    const blocks = [...args.doc.blocks];
    blocks.splice(index + 1, 0, emptyBlock('paragraph', id));
    return {
      ...args.doc,
      blocks,
      provenance: { ...args.doc.provenance, [id]: { title: [], text: [] } },
    };
  }
  const at = Math.max(0, Math.min(args.offset, block.text.length));
  const parts = splitSpans(args.doc.provenance[block.id]?.text ?? [], at, block.text.length, args.newId);
  const rightId = args.newId();
  const leftText = block.text.slice(0, at);
  const rightText = block.text.slice(at);
  const leftMarks = block.marks
    .filter((m) => m.start < at)
    .map((m) => ({ ...m, end: Math.min(m.end, at) }));
  const rightMarks = block.marks
    .filter((m) => m.end > at)
    .map((m) => ({ ...m, start: Math.max(0, m.start - at), end: m.end - at }));
  const leftSeal = await syncBlockPoints({
    blockId: block.id,
    text: leftText,
    spans: parts.left,
    points: args.doc.points,
    evidence: null,
    now: args.now,
    newId: args.newId,
  });
  const rightSeal = await syncBlockPoints({
    blockId: rightId,
    text: rightText,
    spans: parts.right,
    points: args.doc.points,
    evidence: null,
    now: args.now,
    newId: args.newId,
  });
  const blocks = [...args.doc.blocks];
  blocks[index] = { ...block, text: leftText, marks: leftMarks };
  blocks.splice(index + 1, 0, {
    id: rightId,
    type: block.type,
    title: '',
    text: rightText,
    marks: rightMarks,
    listStyle: block.listStyle ?? null,
    indentLevel: block.indentLevel ?? 0,
  });
  const points = [
    ...args.doc.points.filter((p) => p.blockId !== block.id && p.blockId !== rightId),
    ...leftSeal.points.filter((p) => p.blockId === block.id),
    ...rightSeal.points.filter((p) => p.blockId === rightId),
  ];
  return {
    ...args.doc,
    blocks,
    points,
    provenance: {
      ...args.doc.provenance,
      [block.id]: { ...(args.doc.provenance[block.id] ?? { title: [], text: [] }), text: leftSeal.spans },
      [rightId]: { title: [], text: rightSeal.spans },
    },
  };
}

export async function mergeParagraphBackward(args: {
  doc: ManuscriptDocument;
  blockId: string;
  now: string;
  newId: () => string;
}): Promise<ManuscriptDocument> {
  const index = args.doc.blocks.findIndex((b) => b.id === args.blockId);
  const block = args.doc.blocks[index];
  if (!block || !isProseBlock(block.type) || index <= 0) return args.doc;
  const prev = args.doc.blocks[index - 1]!;
  if (!isProseBlock(prev.type) || prev.type !== block.type) {
    if (!block.text) {
      const blocks = args.doc.blocks.filter((b) => b.id !== block.id);
      const provenance = { ...args.doc.provenance };
      delete provenance[block.id];
      return {
        ...args.doc,
        blocks,
        provenance,
        points: args.doc.points.filter((p) => p.blockId !== block.id),
      };
    }
    return args.doc;
  }
  const prevSpans = args.doc.provenance[prev.id]?.text ?? [];
  const spans = (args.doc.provenance[block.id]?.text ?? []).map((span) => ({
    ...span,
    start: span.start + prev.text.length,
    end: span.end + prev.text.length,
  }));
  const marks = [
    ...prev.marks,
    ...block.marks.map((m) => ({ ...m, start: m.start + prev.text.length, end: m.end + prev.text.length })),
  ];
  const text = prev.text + block.text;
  const sealed = await syncBlockPoints({
    blockId: prev.id,
    text,
    spans: [...prevSpans, ...spans],
    points: args.doc.points.filter((p) => p.blockId !== block.id),
    evidence: null,
    now: args.now,
    newId: args.newId,
  });
  const blocks = args.doc.blocks.filter((b) => b.id !== block.id).map((b) =>
    b.id === prev.id ? { ...b, text, marks } : b,
  );
  const provenance = { ...args.doc.provenance };
  delete provenance[block.id];
  provenance[prev.id] = { ...(provenance[prev.id] ?? { title: [], text: [] }), text: sealed.spans };
  return { ...args.doc, blocks, provenance, points: sealed.points };
}

export function insertStructure(
  doc: ManuscriptDocument,
  kind: BlockType,
  index: number,
  id: string,
): ManuscriptDocument {
  const block = emptyBlock(kind, id);
  const at = Math.max(0, Math.min(index, doc.blocks.length));
  const blocks = [...doc.blocks.slice(0, at), block, ...doc.blocks.slice(at)];
  return { ...doc, blocks, provenance: { ...doc.provenance, [id]: { title: [], text: [] } } };
}

export function removeBlock(doc: ManuscriptDocument, blockId: string): ManuscriptDocument {
  const block = doc.blocks.find((b) => b.id === blockId);
  if (!block) return doc;
  const blocks =
    block.type === 'chapter' || block.type === 'scene' || block.type === 'section'
      ? unwrapHeading(doc.blocks, blockId)
      : doc.blocks.filter((b) => b.id !== blockId);
  if (blocks === doc.blocks) return doc;
  const provenance = { ...doc.provenance };
  delete provenance[blockId];
  return { ...doc, blocks, provenance, points: doc.points.filter((p) => p.blockId !== blockId) };
}

export function reorderBlocks(
  doc: ManuscriptDocument,
  fromIndex: number,
  dropIndex: number,
  now: string,
  moveId: string,
): ManuscriptDocument {
  const next = moveBlockRange(doc.blocks, fromIndex, dropIndex);
  if (next === doc.blocks) return doc;
  const range = movableRange(doc.blocks, fromIndex);
  const moving = range ? doc.blocks.slice(range.start, range.end) : [];
  const label = moving[0] ? dragPreviewLabel(moving[0], chapterOrder(doc.blocks).find((c) => c.id === moving[0]?.id)?.number) : 'Block';
  const move: MoveRecord = {
    id: moveId,
    at: now,
    blockIds: moving.map((b) => b.id),
    fromIndex,
    toIndex: dropIndex,
    label: `Moved “${label}”. Certification stayed on the keyboard-typed spans.`,
  };
  return { ...doc, blocks: next, moves: [...doc.moves, move] };
}

export function nudgeBlock(
  doc: ManuscriptDocument,
  blockId: string,
  direction: -1 | 1,
  now: string,
  moveId: string,
): ManuscriptDocument {
  const index = doc.blocks.findIndex((b) => b.id === blockId);
  if (index < 0) return doc;
  const next = moveBlockBy(doc.blocks, index, direction);
  if (next === doc.blocks) return doc;
  const range = movableRange(doc.blocks, index);
  const moving = range ? doc.blocks.slice(range.start, range.end) : [];
  const chapterNo = chapterOrder(doc.blocks).find((c) => c.id === moving[0]?.id)?.number;
  const label = moving[0] ? dragPreviewLabel(moving[0], chapterNo) : 'Block';
  const move: MoveRecord = {
    id: moveId,
    at: now,
    blockIds: moving.map((b) => b.id),
    fromIndex: index,
    toIndex: next.findIndex((b) => b.id === blockId),
    label: `Moved “${label}”. Certification stayed on the keyboard-typed spans.`,
  };
  return { ...doc, blocks: next, moves: [...doc.moves, move] };
}

export async function moveTextWithinBlock(args: {
  doc: ManuscriptDocument;
  blockId: string;
  fromStart: number;
  fromEnd: number;
  dropAt: number;
  now: string;
  newId: () => string;
  moveId: string;
}): Promise<ManuscriptDocument> {
  const block = args.doc.blocks.find((b) => b.id === args.blockId);
  if (!block || block.type !== 'paragraph') return args.doc;
  const moved = relocateRange({
    text: block.text,
    spans: args.doc.provenance[block.id]?.text ?? [],
    marks: block.marks,
    fromStart: args.fromStart,
    fromEnd: args.fromEnd,
    dropAt: args.dropAt,
    newId: args.newId,
  });
  if (!moved) return args.doc;
  const sealed = await syncBlockPoints({
    blockId: block.id,
    text: moved.text,
    spans: moved.spans,
    points: args.doc.points,
    evidence: null,
    now: args.now,
    newId: args.newId,
  });
  return {
    ...args.doc,
    blocks: args.doc.blocks.map((b) => (b.id === block.id ? { ...b, text: moved.text, marks: moved.marks } : b)),
    provenance: putSpans(args.doc, block.id, 'text', sealed.spans),
    points: sealed.points,
    moves: [
      ...args.doc.moves,
      {
        id: args.moveId,
        at: args.now,
        blockIds: [block.id],
        fromIndex: args.fromStart,
        toIndex: args.dropAt,
        label: 'Moved a passage inside a paragraph. Keyboard certification moved with that text.',
      },
    ],
  };
}

export async function movePassage(args: {
  doc: ManuscriptDocument;
  fromId: string;
  fromStart: number;
  fromEnd: number;
  toId: string;
  toOffset: number;
  now: string;
  newId: () => string;
  moveId: string;
}): Promise<ManuscriptDocument> {
  if (args.fromId === args.toId) {
    return moveTextWithinBlock({
      doc: args.doc,
      blockId: args.fromId,
      fromStart: args.fromStart,
      fromEnd: args.fromEnd,
      dropAt: args.toOffset,
      now: args.now,
      newId: args.newId,
      moveId: args.moveId,
    });
  }
  const source = args.doc.blocks.find((b) => b.id === args.fromId);
  const target = args.doc.blocks.find((b) => b.id === args.toId);
  if (!source || !target || source.type !== 'paragraph' || target.type !== 'paragraph') return args.doc;
  const fromStart = Math.max(0, Math.min(args.fromStart, source.text.length));
  const fromEnd = Math.max(fromStart, Math.min(args.fromEnd, source.text.length));
  if (fromEnd === fromStart) return args.doc;
  const moving = source.text.slice(fromStart, fromEnd);
  const carried = (args.doc.provenance[source.id]?.text ?? [])
    .map((span) => {
      const a = Math.max(span.start, fromStart);
      const b = Math.min(span.end, fromEnd);
      if (b <= a) return null;
      return { ...span, id: span.start >= fromStart && span.end <= fromEnd ? span.id : args.newId(), start: a - fromStart, end: b - fromStart };
    })
    .filter((span): span is ProvenanceSpan => Boolean(span));
  const retained = args.doc.points.filter((point) => carried.some((span) => span.certificationId === point.id));
  let doc = await editField({
    doc: args.doc,
    blockId: source.id,
    field: 'text',
    start: fromStart,
    end: fromEnd,
    insert: '',
    origin: null,
    event: null,
    now: args.now,
    newId: args.newId,
  });
  for (const point of retained) {
    if (!doc.points.some((existing) => existing.id === point.id)) doc = { ...doc, points: [...doc.points, point] };
  }
  const dest = doc.blocks.find((b) => b.id === target.id);
  if (!dest) return args.doc;
  const at = Math.max(0, Math.min(args.toOffset, dest.text.length));
  const nextText = dest.text.slice(0, at) + moving + dest.text.slice(at);
  const shifted: ProvenanceSpan[] = [];
  for (const span of doc.provenance[dest.id]?.text ?? []) {
    if (span.end <= at) shifted.push(span);
    else if (span.start >= at) shifted.push({ ...span, start: span.start + moving.length, end: span.end + moving.length });
    else {
      shifted.push({ ...span, end: at });
      shifted.push({ ...span, id: args.newId(), start: at + moving.length, end: span.end + moving.length });
    }
  }
  let cursor = at;
  for (const piece of carried) {
    const len = piece.end - piece.start;
    shifted.push({ ...piece, start: cursor, end: cursor + len });
    cursor += len;
  }
  const sealed = await syncBlockPoints({
    blockId: dest.id,
    text: nextText,
    spans: shifted,
    points: doc.points,
    evidence: null,
    now: args.now,
    newId: args.newId,
  });
  return prunePoints({
    ...doc,
    blocks: doc.blocks.map((b) => (b.id === dest.id ? { ...b, text: nextText } : b)),
    provenance: putSpans(doc, dest.id, 'text', sealed.spans),
    points: sealed.points,
    moves: [
      ...doc.moves,
      {
        id: args.moveId,
        at: args.now,
        blockIds: [source.id, dest.id],
        fromIndex: fromStart,
        toIndex: at,
        label: 'Moved a passage between paragraphs. Keyboard certification moved with that text.',
      },
    ],
  });
}

export function updateParagraphMeta(
  doc: ManuscriptDocument,
  blockId: string,
  patch: Partial<Pick<ManuscriptBlock, 'listStyle' | 'indentLevel'>>,
): ManuscriptDocument {
  return {
    ...doc,
    blocks: doc.blocks.map((b) =>
      b.id === blockId && isProseBlock(b.type) ? { ...b, ...patch } : b,
    ),
  };
}

export function updateTableRows(doc: ManuscriptDocument, blockId: string, tableRows: string[][]): ManuscriptDocument {
  return {
    ...doc,
    blocks: doc.blocks.map((b) => (b.id === blockId && b.type === 'table' ? { ...b, tableRows } : b)),
  };
}

export function updateImageBlock(
  doc: ManuscriptDocument,
  blockId: string,
  patch: { imageSrc?: string; imageAlt?: string },
): ManuscriptDocument {
  return {
    ...doc,
    blocks: doc.blocks.map((b) => (b.id === blockId && b.type === 'image' ? { ...b, ...patch } : b)),
  };
}

export function updateDividerBlock(
  doc: ManuscriptDocument,
  blockId: string,
  patch: { title?: string; dividerStyle?: DividerStyle },
): ManuscriptDocument {
  return {
    ...doc,
    blocks: doc.blocks.map((b) => (b.id === blockId && b.type === 'divider' ? { ...b, ...patch } : b)),
  };
}

export function toggleFormat(
  doc: ManuscriptDocument,
  blockId: string,
  range: { start: number; end: number },
  kind: InlineMarkKind,
): ManuscriptDocument {
  return {
    ...doc,
    blocks: doc.blocks.map((block) => {
      if (block.id !== blockId || !isProseBlock(block.type)) return block;
      const expanded = expandCollapsedRange(block.text, range.start, range.end);
      return { ...block, marks: toggleMark(block.marks, expanded.start, expanded.end, kind, block.text.length) };
    }),
  };
}

export function certificationSummary(doc: ManuscriptDocument): { certified: number; uncertified: number; points: number } {
  let certified = 0;
  let uncertified = 0;
  for (const block of doc.blocks) {
    const prov = doc.provenance[block.id];
    if (isProseBlock(block.type)) {
      const counts = countOriginWords(block.text, prov?.text ?? []);
      certified += counts.certified;
      uncertified += counts.uncertified;
    } else if (block.title.trim()) {
      const counts = countOriginWords(block.title, prov?.title ?? []);
      certified += counts.certified;
      uncertified += counts.uncertified;
    }
  }
  return { certified, uncertified, points: doc.points.length };
}

export function passageState(spans: ProvenanceSpan[], text: string): 'empty' | 'certified' | 'uncertified' | 'mixed' {
  if (!text) return 'empty';
  let sealed = false;
  let other = false;
  for (const span of spans) {
    if (span.end <= span.start) continue;
    if ((span.origin === 'keyboard' || span.origin === 'dictation') && span.certificationId) sealed = true;
    else other = true;
  }
  if (sealed && other) return 'mixed';
  if (sealed) return 'certified';
  if (!spans.length) return 'uncertified';
  return 'uncertified';
}

export function certificationExport(doc: ManuscriptDocument, exportedAt: string) {
  return {
    product: 'SpeakFiction',
    recordVersion: 1,
    manuscriptId: doc.manuscriptId,
    title: displayTitle(doc),
    exportedAt,
    trust: TRUST_STATEMENT,
    basedOn: 'Speak Fiction manuscript editor (github.com/shane-carlson/SpeakFiction): block model, rich-text marks, and drag reorder.',
    points: doc.points,
    moves: doc.moves,
    passages: doc.blocks.map((block) => ({
      id: block.id,
      type: block.type,
      text: isProseBlock(block.type) ? block.text : block.title,
      spans: (isProseBlock(block.type) ? doc.provenance[block.id]?.text : doc.provenance[block.id]?.title) ?? [],
    })),
  };
}

/**
 * Replace one find hit. The new text is an other insertion, never a keyboard seal.
 * Remnants on either side keep their seals, the same way a paste splits a span.
 */
export async function replaceManuscriptMatch(args: {
  doc: ManuscriptDocument;
  match: ManuscriptMatch;
  replacement: string;
  now: string;
  newId: () => string;
}): Promise<ManuscriptDocument> {
  return editField({
    doc: args.doc,
    blockId: args.match.blockId,
    field: args.match.field,
    start: args.match.start,
    end: args.match.end,
    insert: args.replacement,
    origin: 'other',
    event: null,
    now: args.now,
    newId: args.newId,
  });
}

/**
 * Replace every current match once, from the end of each field so earlier offsets stay valid.
 * Text inserted by the replacement is not searched again.
 */
export async function replaceAllManuscriptMatches(args: {
  doc: ManuscriptDocument;
  query: string;
  replacement: string;
  now: string;
  newId: () => string;
}): Promise<{ doc: ManuscriptDocument; count: number }> {
  const matches = findMatches(args.doc.blocks, args.query);
  if (!matches.length) return { doc: args.doc, count: 0 };
  const indexOf = new Map(args.doc.blocks.map((block, index) => [block.id, index]));
  const ordered = [...matches].sort((a, b) => {
    const ai = indexOf.get(a.blockId) ?? 0;
    const bi = indexOf.get(b.blockId) ?? 0;
    if (ai !== bi) return bi - ai;
    return b.start - a.start;
  });
  let doc = args.doc;
  for (const match of ordered) {
    doc = await replaceManuscriptMatch({
      doc,
      match,
      replacement: args.replacement,
      now: args.now,
      newId: args.newId,
    });
  }
  return { doc, count: matches.length };
}

export function manuscriptExport(doc: ManuscriptDocument, exportedAt: string) {
  return {
    product: 'SpeakFiction',
    manuscriptVersion: 1,
    manuscriptId: doc.manuscriptId,
    title: displayTitle(doc),
    exportedAt,
    basedOn: 'Speak Fiction manuscript blocks',
    blocks: doc.blocks.map((block) => ({
      id: block.id,
      type: block.type,
      title: isProseBlock(block.type) ? undefined : block.title,
      text: isProseBlock(block.type) ? block.text : undefined,
      marks: isProseBlock(block.type) ? block.marks : undefined,
      listStyle: isProseBlock(block.type) ? block.listStyle : undefined,
      indentLevel: isProseBlock(block.type) ? block.indentLevel : undefined,
      dividerStyle: block.type === 'divider' ? block.dividerStyle : undefined,
      tableRows: block.type === 'table' ? block.tableRows : undefined,
      imageSrc: block.type === 'image' ? block.imageSrc : undefined,
      imageAlt: block.type === 'image' ? block.imageAlt : undefined,
    })),
  };
}

