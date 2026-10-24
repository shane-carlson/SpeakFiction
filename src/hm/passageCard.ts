/**
 * Which certification-pane card a manuscript span links to.
 * Sealed keyboard and dictation spans use their certification id. Other spans use a display key.
 * This does not create or change certification points.
 */

import { isSealedOrigin, type ProvenanceSpan } from './certification';
import type { ManuscriptDocument } from './document';
import { isProseBlock } from './types';

export interface PassageSpanLink {
  id: string;
  origin: ProvenanceSpan['origin'];
  certificationId?: string;
}

/** Card id for a span. Unspanned / seed text uses `bare` so hover can still find a pane card. */
export function passageCardId(blockId: string, span: PassageSpanLink): string | null {
  if (!blockId) return null;
  if (isSealedOrigin(span.origin) && span.certificationId) return span.certificationId;
  return `span:${blockId}:${span.id || 'bare'}`;
}

export interface OpenPassageCard {
  id: string;
  origin: ProvenanceSpan['origin'];
  text: string;
}

function uncoveredText(text: string, spans: { start: number; end: number }[]): string {
  if (!text) return '';
  if (spans.length === 0) return text;
  const covered = new Uint8Array(text.length);
  for (const span of spans) {
    const start = Math.max(0, span.start);
    const end = Math.min(text.length, span.end);
    if (end > start) covered.fill(1, start, end);
  }
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (!covered[i]) out += text[i];
  }
  return out;
}

/** Unsealed passages shown as cards in the certification highlight view. */
export function openPassageCards(doc: ManuscriptDocument): OpenPassageCard[] {
  const cards: OpenPassageCard[] = [];
  for (const block of doc.blocks) {
    const prose = isProseBlock(block.type);
    if (!prose && block.type !== 'chapter' && block.type !== 'scene' && block.type !== 'section') continue;
    const text = prose ? block.text : block.title;
    const spans = (prose ? doc.provenance[block.id]?.text : doc.provenance[block.id]?.title) ?? [];
    for (const span of spans) {
      if (span.end <= span.start) continue;
      if (isSealedOrigin(span.origin) && span.certificationId) continue;
      const slice = text.slice(Math.max(0, span.start), Math.min(text.length, span.end));
      if (!slice.trim()) continue;
      const id = passageCardId(block.id, span);
      if (!id) continue;
      cards.push({ id, origin: span.origin, text: slice });
    }
    const bare = uncoveredText(text, spans);
    if (bare.trim()) {
      const id = passageCardId(block.id, { id: 'bare', origin: 'other' });
      if (id) cards.push({ id, origin: 'other', text: bare });
    }
  }
  return cards;
}

/** Pixels to add to a pane's scrollTop so the card sits inside the visible box. */
export function scrollDelta(
  viewTop: number,
  viewBottom: number,
  cardTop: number,
  cardBottom: number,
  pad = 10,
): number {
  const viewHeight = viewBottom - viewTop;
  const cardHeight = cardBottom - cardTop;
  if (viewHeight <= 0 || cardHeight <= 0) return 0;
  if (cardHeight >= viewHeight - pad * 2) return cardTop - (viewTop + pad);
  if (cardTop < viewTop + pad) return cardTop - (viewTop + pad);
  if (cardBottom > viewBottom - pad) return cardBottom - (viewBottom - pad);
  return 0;
}
