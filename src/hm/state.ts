import type { CertificationPoint, MoveRecord, ProvenanceSpan } from './certification';
import type { ManuscriptFontId } from './typography';

/** Certification stored beside SpeakFiction blocks. The speech pipeline does not read this. */
export interface ManuscriptCertification {
  provenance: Record<string, { title: ProvenanceSpan[]; text: ProvenanceSpan[] }>;
  points: CertificationPoint[];
  moves: MoveRecord[];
  fontFamily?: ManuscriptFontId;
  fontSize?: number;
}

const ORIGINS = new Set(['keyboard', 'dictation', 'paste', 'drop', 'other']);

function span(raw: unknown): ProvenanceSpan | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== 'string' || typeof rec.start !== 'number' || typeof rec.end !== 'number') return null;
  if (typeof rec.origin !== 'string' || !ORIGINS.has(rec.origin)) return null;
  const next: ProvenanceSpan = {
    id: rec.id,
    start: rec.start,
    end: rec.end,
    origin: rec.origin as ProvenanceSpan['origin'],
  };
  if (typeof rec.certificationId === 'string') next.certificationId = rec.certificationId;
  if (typeof rec.pasteHint === 'string') next.pasteHint = rec.pasteHint;
  return next;
}

function spanList(raw: unknown): ProvenanceSpan[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(span).filter((item): item is ProvenanceSpan => Boolean(item));
}

export function normalizeCertification(raw: unknown): ManuscriptCertification | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const rec = raw as Record<string, unknown>;
  const provenance: ManuscriptCertification['provenance'] = {};
  if (rec.provenance && typeof rec.provenance === 'object') {
    for (const [id, value] of Object.entries(rec.provenance as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const fields = value as Record<string, unknown>;
      provenance[id] = { title: spanList(fields.title), text: spanList(fields.text) };
    }
  }
  const points = Array.isArray(rec.points) ? (rec.points.filter((point) => point && typeof point === 'object') as CertificationPoint[]) : [];
  const moves = Array.isArray(rec.moves) ? (rec.moves.filter((move) => move && typeof move === 'object') as MoveRecord[]) : [];
  const next: ManuscriptCertification = { provenance, points, moves };
  if (typeof rec.fontFamily === 'string') next.fontFamily = rec.fontFamily as ManuscriptFontId;
  if (typeof rec.fontSize === 'number' && Number.isFinite(rec.fontSize)) next.fontSize = rec.fontSize;
  return next;
}
