export type WordCue = {
  word: string;
  startMs: number;
  endMs: number;
  /** Real speech timing or a saved on-device cue, not a guessed split. */
  cued?: boolean;
};

export function tokenizeWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

export function parseWordCues(raw: unknown): WordCue[] {
  if (!Array.isArray(raw)) return [];
  const words: WordCue[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const word = typeof rec.word === 'string' ? rec.word : '';
    const startMs = Math.max(0, Number(rec.startMs) || 0);
    const endMs = Math.max(startMs, Number(rec.endMs) || startMs);
    if (!word) continue;
    words.push({ word, startMs, endMs, cued: rec.cued === true });
  }
  return words;
}

export function estimateWordCues(text: string, durationMs: number): WordCue[] {
  const tokens = tokenizeWords(text);
  if (!tokens.length) return [];
  const span = Math.max(durationMs, tokens.length * 280);
  const weights = tokens.map((token) => Math.max(1, token.replace(/[^a-zA-Z0-9]+/g, '').length || 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let at = 0;
  return tokens.map((word, index) => {
    const startMs = at;
    at += (weights[index] / total) * span;
    return { word, startMs, endMs: index === tokens.length - 1 ? span : at, cued: false };
  });
}

export function wordsForTake(text: string, durationMs: number, stored?: WordCue[] | null): WordCue[] {
  const tokens = tokenizeWords(text);
  if (!tokens.length) return [];
  if (stored?.length && stored.map((item) => item.word).join(' ') === tokens.join(' ')) return stored;
  return estimateWordCues(text, durationMs);
}

export function cuesFromSegments(
  segments: Array<{ segment?: string; transcript?: string; startTimeMillis?: number; endTimeMillis?: number }>,
): WordCue[] {
  const words: WordCue[] = [];
  for (const seg of segments) {
    const piece = String(seg.segment ?? seg.transcript ?? '').trim();
    if (!piece) continue;
    const start = Math.max(0, Number(seg.startTimeMillis) || 0);
    const end = Math.max(start + 80, Number(seg.endTimeMillis) || start + 400);
    const parts = tokenizeWords(piece);
    const span = Math.max(1, end - start);
    parts.forEach((word, index) => {
      const startMs = start + (span * index) / parts.length;
      const endMs = start + (span * (index + 1)) / parts.length;
      words.push({ word, startMs, endMs, cued: true });
    });
  }
  return words;
}

export function parsePeaks(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const n = Number(item);
      if (!Number.isFinite(n)) return 0;
      return Math.min(1, Math.max(0.06, n));
    })
    .slice(0, 128);
}

export function downsamplePeaks(peaks: number[], count = 72): number[] {
  if (!peaks.length) return [];
  if (peaks.length <= count) return peaks;
  const out: number[] = [];
  const step = peaks.length / count;
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    let max = 0;
    for (let j = start; j < end; j++) max = Math.max(max, peaks[j] ?? 0);
    out.push(max);
  }
  return out;
}

export function syntheticPeaks(seed: string, count = 72): number[] {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    hash = Math.imul(hash ^ (i + 1), 16777619);
    const noise = ((hash >>> 0) % 1000) / 1000;
    const envelope = Math.sin((i / Math.max(1, count - 1)) * Math.PI) * 0.65 + 0.22;
    out.push(0.1 + noise * envelope);
  }
  return out;
}

export function peaksForTake(id: string, stored?: number[] | null): number[] {
  if (stored && stored.length >= 8) return stored;
  return syntheticPeaks(id);
}

export function textFromWords(words: WordCue[]): string {
  return words.map((item) => item.word).join(' ').trim();
}

export function replaceWordAt(words: WordCue[], index: number, word: string): WordCue[] {
  const next = word.trim();
  if (!next || !words[index]) return words;
  return words.map((item, i) => (i === index ? { ...item, word: next, cued: true } : item));
}

export function activeWordIndex(words: WordCue[], positionMs: number): number {
  if (!words.length) return -1;
  for (let i = words.length - 1; i >= 0; i--) {
    if (positionMs >= words[i].startMs) return i;
  }
  return 0;
}
