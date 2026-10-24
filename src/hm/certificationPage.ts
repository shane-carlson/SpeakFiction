/**
 * One-page certification summary shared by the export preview and every exporter.
 * Describes origins; does not reclassify body text or list every passage.
 */

import { TRUST_STATEMENT, type ProvenanceSpan } from './certification';
import { UNAVAILABLE_DEVICE_LABEL, formatTypingDeviceLabel } from './deviceName';
import type { ManuscriptDocument } from './document';
import { displayTitle } from './document';
import { manuscriptStats } from './manuscript';
import { isProseBlock } from './types';

export interface OriginWordTotals {
  keyboardSealed: number;
  /** Sealed dictated words. Not included in keyboard, paste, drop, or other. */
  dictationSealed: number;
  paste: number;
  drop: number;
  other: number;
  /** Paste + drop + other. Dictation is sealed, so it is not included. */
  pastedUncertified: number;
  totalWords: number;
}

export interface CertificationPageIdentity {
  bookTitle?: string;
  /** Preformatted series membership, omitted when the book is standalone. */
  seriesLabel?: string | null;
}

export const CERTIFICATION_PURPOSE =
  'SpeakFiction tracks and certifies how a manuscript is written — typed versus pasted — as evidence of human-written content. It does not guarantee the work is human-generated. It shows how, when, and on what devices specific parts of the manuscript were introduced, and by what means: keyboard versus pasted. Certifications are timestamped and include a SHA key tied to the manuscript ID and device.';

/** Purpose first, then the trust limit, as the one summary banner. */
export function certificationBannerText(): string {
  return `${CERTIFICATION_PURPOSE} ${TRUST_STATEMENT}`;
}

export interface CertificationPageModel {
  product: 'SpeakFiction';
  bookTitle: string;
  seriesLabel: string | null;
  manuscriptTitle: string;
  manuscriptId: string;
  exportedAt: string;
  exportedAtLabel: string;
  /** Purpose and trust limit in one block. */
  banner: string;
  /** Distinct card labels for certified spans, in manuscript order. */
  devices: string[];
  totals: OriginWordTotals;
  chapters: number;
  scenes: number;
  sections: number;
  paragraphs: number;
  certificationPoints: number;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatExportDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function emptyTotals(): OriginWordTotals {
  return {
    keyboardSealed: 0,
    dictationSealed: 0,
    paste: 0,
    drop: 0,
    other: 0,
    pastedUncertified: 0,
    totalWords: 0,
  };
}

function wordTotals(text: string, spans: ProvenanceSpan[]): OriginWordTotals {
  const totals = emptyTotals();
  if (!text.trim()) return totals;
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const at = match.index;
    const span = spans.find((s) => s.start <= at && s.end > at);
    if (span?.origin === 'keyboard' && span.certificationId) totals.keyboardSealed += 1;
    else if (span?.origin === 'dictation' && span.certificationId) totals.dictationSealed += 1;
    else if (span?.origin === 'paste') totals.paste += 1;
    else if (span?.origin === 'drop') totals.drop += 1;
    else totals.other += 1;
  }
  totals.pastedUncertified = totals.paste + totals.drop + totals.other;
  totals.totalWords = totals.keyboardSealed + totals.dictationSealed + totals.pastedUncertified;
  return totals;
}

function mergeTotals(into: OriginWordTotals, add: OriginWordTotals): void {
  into.keyboardSealed += add.keyboardSealed;
  into.dictationSealed += add.dictationSealed;
  into.paste += add.paste;
  into.drop += add.drop;
  into.other += add.other;
  into.pastedUncertified += add.pastedUncertified;
  into.totalWords += add.totalWords;
}

/**
 * Distinct device labels on certified spans, in manuscript order.
 * The unavailable sentence is replaced the same way a card replaces it.
 */
export function manuscriptDeviceLabels(doc: ManuscriptDocument, live?: string | null): string[] {
  const byId = new Map(doc.points.map((point) => [point.id, point]));
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const block of doc.blocks) {
    const prov = doc.provenance[block.id];
    const spans = [...(prov?.title ?? []), ...(prov?.text ?? [])];
    for (const span of spans) {
      if (!span.certificationId) continue;
      const stored = byId.get(span.certificationId)?.typingDevice;
      if (!stored?.trim()) continue;
      const label = formatTypingDeviceLabel(stored, live);
      if (!label || label === UNAVAILABLE_DEVICE_LABEL || seen.has(label)) continue;
      seen.add(label);
      labels.push(label);
    }
  }
  return labels;
}

/** One stored device names itself. Several are listed by name. */
export function deviceStatLine(devices: string[]): string | null {
  if (devices.length === 0) return null;
  if (devices.length === 1) return `Device: ${devices[0]}`;
  return `Devices: ${devices.join(', ')}`;
}

export function buildCertificationPageModel(
  doc: ManuscriptDocument,
  exportedAt: string,
  identity: CertificationPageIdentity = {},
  liveDevice?: string | null,
): CertificationPageModel {
  const totals = emptyTotals();
  for (const block of doc.blocks) {
    const prov = doc.provenance[block.id];
    if (isProseBlock(block.type)) {
      mergeTotals(totals, wordTotals(block.text, prov?.text ?? []));
    } else if (block.title.trim()) {
      mergeTotals(totals, wordTotals(block.title, prov?.title ?? []));
    }
  }
  const stats = manuscriptStats(doc.blocks);
  const seriesLabel = identity.seriesLabel?.trim() || null;
  return {
    product: 'SpeakFiction',
    bookTitle: identity.bookTitle?.trim() || displayTitle(doc),
    seriesLabel,
    manuscriptTitle: displayTitle(doc),
    manuscriptId: doc.manuscriptId,
    exportedAt,
    exportedAtLabel: formatExportDateTime(exportedAt),
    banner: certificationBannerText(),
    devices: manuscriptDeviceLabels(doc, liveDevice),
    totals,
    chapters: stats.chapters,
    scenes: stats.scenes,
    sections: stats.sections,
    paragraphs: stats.paragraphs,
    certificationPoints: doc.points.length,
  };
}

/** Ordered lines of the one-page summary. Exporters and the preview render these facts. */
export function certificationFactLines(model: CertificationPageModel): string[] {
  const lines = [
    'SpeakFiction certification summary',
    '',
    model.banner,
    '',
    `Book: ${model.bookTitle}`,
  ];
  if (model.seriesLabel) lines.push(`Series: ${model.seriesLabel}`);
  lines.push(
    `Manuscript: ${model.manuscriptTitle}`,
    `Manuscript id: ${model.manuscriptId}`,
    '',
    'Certified versus pasted',
    `Keyboard-certified words: ${model.totals.keyboardSealed}`,
    `Dictation-certified words: ${model.totals.dictationSealed}`,
    `Pasted / uncertified words: ${model.totals.pastedUncertified}`,
    `Paste: ${model.totals.paste}`,
    `Drop: ${model.totals.drop}`,
    `Other: ${model.totals.other}`,
    '',
    'Statistics',
    `Exported: ${model.exportedAtLabel}`,
    `Total words: ${model.totals.totalWords}`,
    `Certified words: ${model.totals.keyboardSealed + model.totals.dictationSealed}`,
    `Pasted / uncertified words: ${model.totals.pastedUncertified}`,
    `Chapters: ${model.chapters}`,
    `Scenes: ${model.scenes}`,
    `Sections: ${model.sections}`,
    `Paragraphs: ${model.paragraphs}`,
    `Certification points: ${model.certificationPoints}`,
  );
  const devices = deviceStatLine(model.devices);
  if (devices) lines.push(devices);
  lines.push(`Book: ${model.bookTitle}`);
  if (model.seriesLabel) lines.push(`Series: ${model.seriesLabel}`);
  return lines;
}

export function certificationPagePlain(model: CertificationPageModel): string {
  return `${certificationFactLines(model).join('\n')}\n`;
}

export { TRUST_STATEMENT };
