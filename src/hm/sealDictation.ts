/**
 * Seal text that SpeakFiction's dictation pipeline just folded into the manuscript.
 * Block structure still comes from insertSegments. This only records origin.
 * A split that keeps a remnant in a new block keeps that remnant's seal.
 * Newly spoken words are sealed as dictation, not keyboard, paste, or other.
 */

import {
  applyTextChange,
  splitSpans,
  syncBlockPoints,
  type InputEvidence,
  type ProvenanceSpan,
} from './certification';
import type { ManuscriptCertification } from './state';
import type { Block } from '../core/types';

function emptyCertification(): ManuscriptCertification {
  return { provenance: {}, points: [], moves: [] };
}

function fieldOf(block: Block): 'title' | 'text' | null {
  if (block.type === 'paragraph' || block.type === 'blockquote') return 'text';
  if (block.type === 'chapter' || block.type === 'scene' || block.type === 'section') return 'title';
  return null;
}

function fieldText(block: Block, field: 'title' | 'text'): string {
  return (field === 'title' ? block.title : block.text) ?? '';
}

function spansFor(cert: ManuscriptCertification, id: string, field: 'title' | 'text'): ProvenanceSpan[] {
  return cert.provenance[id]?.[field] ?? [];
}

function putSpans(
  cert: ManuscriptCertification,
  id: string,
  field: 'title' | 'text',
  spans: ProvenanceSpan[],
): ManuscriptCertification {
  const prev = cert.provenance[id] ?? { title: [], text: [] };
  return { ...cert, provenance: { ...cert.provenance, [id]: { ...prev, [field]: spans } } };
}

function diffEnds(before: string, after: string): { start: number; end: number; insert: string } {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let tail = 0;
  while (
    tail < before.length - start &&
    tail < after.length - start &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail += 1;
  }
  return { start, end: before.length - tail, insert: after.slice(start, after.length - tail) };
}

function dictationEvent(now: string, data: string): InputEvidence {
  return {
    at: now,
    inputType: 'insertFromDictation',
    data: data ? data.slice(0, 240) : null,
    trusted: true,
  };
}

export function sealDictationChange(args: {
  before: Block[];
  after: Block[];
  certification?: ManuscriptCertification;
  now: string;
  newId: () => string;
}): ManuscriptCertification {
  let cert = args.certification
    ? {
        ...args.certification,
        provenance: { ...args.certification.provenance },
        points: args.certification.points.slice(),
        moves: args.certification.moves.slice(),
      }
    : emptyCertification();
  const beforeById = new Map(args.before.map((block) => [block.id, block]));
  const afterIds = new Set(args.after.map((block) => block.id));
  const carried = new Map<string, { field: 'title' | 'text'; spans: ProvenanceSpan[] }>();

  for (const block of args.after) {
    const field = fieldOf(block);
    if (!field) continue;
    const prev = beforeById.get(block.id);
    if (!prev || fieldOf(prev) !== field) continue;
    const beforeText = fieldText(prev, field);
    const afterText = fieldText(block, field);
    if (beforeText === afterText) continue;
    const change = diffEnds(beforeText, afterText);
    if (change.insert === '' && change.end > change.start) {
      const removed = beforeText.slice(change.start, change.end).replace(/^\s+/, '');
      if (removed) {
        const heir = args.after.find((candidate) => {
          if (beforeById.has(candidate.id)) return false;
          return fieldOf(candidate) === field && fieldText(candidate, field) === removed;
        });
        if (heir) {
          const at = beforeText.lastIndexOf(removed);
          const prefix = beforeText.slice(0, at).replace(/\s+$/, '');
          if (prefix === afterText) {
            const parts = splitSpans(spansFor(cert, block.id, field), at, beforeText.length, args.newId);
            carried.set(heir.id, { field, spans: parts.right });
          }
        }
      }
    }
    const edited = applyTextChange({
      text: beforeText,
      spans: spansFor(cert, block.id, field),
      marks: field === 'text' ? block.marks ?? prev.marks ?? [] : [],
      start: change.start,
      end: change.end,
      insert: change.insert,
      origin: change.insert ? 'dictation' : null,
      newId: args.newId,
    });
    const sealed = syncBlockPoints({
      blockId: block.id,
      text: edited.text,
      spans: edited.spans,
      points: cert.points,
      evidence:
        change.insert && edited.evidenceSpanIds.length
          ? { spanIds: edited.evidenceSpanIds, event: dictationEvent(args.now, change.insert) }
          : null,
      now: args.now,
      newId: args.newId,
    });
    cert = putSpans(cert, block.id, field, sealed.spans);
    cert = { ...cert, points: sealed.points };
  }

  for (const block of args.after) {
    if (beforeById.has(block.id)) continue;
    const field = fieldOf(block);
    if (!field) continue;
    const text = fieldText(block, field);
    const remembered = carried.get(block.id);
    if (remembered && remembered.field === field) {
      const sealed = syncBlockPoints({
        blockId: block.id,
        text,
        spans: remembered.spans,
        points: cert.points,
        evidence: null,
        now: args.now,
        newId: args.newId,
      });
      cert = putSpans(cert, block.id, field, sealed.spans);
      cert = { ...cert, points: sealed.points };
      continue;
    }
    if (!text) continue;
    const edited = applyTextChange({
      text: '',
      spans: [],
      marks: field === 'text' ? block.marks ?? [] : [],
      start: 0,
      end: 0,
      insert: text,
      origin: 'dictation',
      newId: args.newId,
    });
    const sealed = syncBlockPoints({
      blockId: block.id,
      text: edited.text,
      spans: edited.spans,
      points: cert.points,
      evidence: edited.evidenceSpanIds.length
        ? { spanIds: edited.evidenceSpanIds, event: dictationEvent(args.now, text) }
        : null,
      now: args.now,
      newId: args.newId,
    });
    cert = putSpans(cert, block.id, field, sealed.spans);
    cert = { ...cert, points: sealed.points };
  }

  const provenance: ManuscriptCertification['provenance'] = {};
  for (const [id, spans] of Object.entries(cert.provenance)) {
    if (afterIds.has(id)) provenance[id] = spans;
  }
  return {
    ...cert,
    provenance,
    points: cert.points.filter((point) => afterIds.has(point.blockId)),
  };
}
