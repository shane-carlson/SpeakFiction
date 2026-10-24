import type { ProvenanceSpan } from './certification';

export interface ProvenanceMix {
  totalChars: number;
  sealedChars: number;
  dictationChars: number;
  pasteChars: number;
  dropChars: number;
  otherChars: number;
}

export function provenanceMix(text: string, spans: ProvenanceSpan[]): ProvenanceMix {
  const len = text.length;
  const mix: ProvenanceMix = {
    totalChars: len,
    sealedChars: 0,
    dictationChars: 0,
    pasteChars: 0,
    dropChars: 0,
    otherChars: 0,
  };
  if (!len) return mix;
  for (const span of spans) {
    if (span.end <= span.start) continue;
    const n = Math.min(span.end, len) - Math.max(span.start, 0);
    if (n <= 0) continue;
    if (span.origin === 'keyboard' && span.certificationId) mix.sealedChars += n;
    else if (span.origin === 'dictation') mix.dictationChars += n;
    else if (span.origin === 'paste') mix.pasteChars += n;
    else if (span.origin === 'drop') mix.dropChars += n;
    else mix.otherChars += n;
  }
  const accounted = mix.sealedChars + mix.dictationChars + mix.pasteChars + mix.dropChars + mix.otherChars;
  if (accounted < len) mix.otherChars += len - accounted;
  return mix;
}

export function mixPercentages(mix: ProvenanceMix): {
  sealed: number;
  dictation: number;
  paste: number;
  drop: number;
  other: number;
} {
  const total = mix.totalChars || 1;
  return {
    sealed: Math.round((mix.sealedChars / total) * 100),
    dictation: Math.round((mix.dictationChars / total) * 100),
    paste: Math.round((mix.pasteChars / total) * 100),
    drop: Math.round((mix.dropChars / total) * 100),
    other: Math.round((mix.otherChars / total) * 100),
  };
}

export function formatMixLabel(mix: ProvenanceMix): string | null {
  if (mix.totalChars === 0) return null;
  const p = mixPercentages(mix);
  const parts: string[] = [];
  if (p.sealed) parts.push(`${p.sealed}% sealed`);
  if (p.dictation) parts.push(`${p.dictation}% dictated`);
  if (p.paste) parts.push(`${p.paste}% pasted`);
  if (p.drop) parts.push(`${p.drop}% dropped`);
  if (p.other) parts.push(`${p.other}% other`);
  return parts.join(' · ');
}
