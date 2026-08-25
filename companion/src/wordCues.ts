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

export type SpeechWindow = { startMs: number; endMs: number };

/** Metering silence is clamped to 0.08 while recording. Speech sits above that floor. */
const PEAK_SPEECH_FLOOR = 0.14;

export function speechWindowFromPeaks(peaks: number[] | null | undefined, durationMs: number): SpeechWindow {
  const span = Math.max(0, durationMs);
  if (!peaks?.length || span <= 0) return { startMs: 0, endMs: span };
  const sorted = [...peaks].sort((a, b) => a - b);
  const q15 = sorted[Math.floor((sorted.length - 1) * 0.15)] ?? 0;
  const q80 = sorted[Math.floor((sorted.length - 1) * 0.8)] ?? 1;
  const rise = q80 - q15;
  if (rise < 0.06) return { startMs: 0, endMs: span };
  const floor = Math.max(PEAK_SPEECH_FLOOR, q15 + Math.max(0.05, rise * 0.32));
  let first = -1;
  let last = -1;
  for (let i = 0; i < peaks.length - 1; i++) {
    if ((peaks[i] ?? 0) < floor || (peaks[i + 1] ?? 0) < floor) continue;
    if (first < 0) first = i;
    last = i + 1;
  }
  if (first < 0) return { startMs: 0, endMs: span };
  return {
    startMs: (first / peaks.length) * span,
    endMs: Math.max(((last + 1) / peaks.length) * span, (first / peaks.length) * span + 80),
  };
}

export function estimateWordCues(
  text: string,
  durationMs: number,
  span?: SpeechWindow | null,
): WordCue[] {
  const tokens = tokenizeWords(text);
  if (!tokens.length) return [];
  const start = Math.max(0, span?.startMs ?? 0);
  const end = Math.max(start + tokens.length * 80, span?.endMs ?? Math.max(durationMs, start + tokens.length * 280));
  const length = Math.max(end - start, tokens.length * 80);
  const weights = tokens.map((token) => Math.max(1, token.replace(/[^a-zA-Z0-9]+/g, '').length || 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let at = start;
  return tokens.map((word, index) => {
    const startMs = at;
    at += (weights[index] / total) * length;
    return { word, startMs, endMs: index === tokens.length - 1 ? start + length : at, cued: false };
  });
}

export function alignWordCues(
  words: WordCue[],
  durationMs: number,
  peaks?: number[] | null,
): WordCue[] {
  if (!words.length) return words;
  const window = speechWindowFromPeaks(peaks, durationMs);
  const leading = window.startMs;
  const trailing = Math.max(0, durationMs - window.endMs);
  if (leading < 280 && trailing < 280) return words;
  const srcStart = words[0].startMs;
  const srcEnd = Math.max(words[words.length - 1].endMs, srcStart + 1);
  const srcSpan = srcEnd - srcStart;
  const dstSpan = Math.max(80, window.endMs - window.startMs);
  if (Math.abs(srcStart - window.startMs) < 280 && Math.abs(srcEnd - window.endMs) < 450) return words;
  if (srcSpan < dstSpan * 0.35) return estimateWordCues(textFromWords(words), durationMs, window);
  const scale = dstSpan / srcSpan;
  return words.map((item) => ({
    ...item,
    startMs: window.startMs + (item.startMs - srcStart) * scale,
    endMs: window.startMs + (item.endMs - srcStart) * scale,
  }));
}

export function normalizeCueUnits(words: WordCue[], durationMs: number): WordCue[] {
  if (!words.length || durationMs <= 0) return words;
  const last = words[words.length - 1].endMs;
  const asMillis = last * 1000;
  if (last > 0 && asMillis >= durationMs * 0.25 && asMillis <= durationMs * 1.4) {
    return words.map((item) => ({
      ...item,
      startMs: item.startMs * 1000,
      endMs: item.endMs * 1000,
    }));
  }
  return words;
}

export function syncWordTimings(
  display: WordCue[],
  timed: WordCue[] | null | undefined,
  durationMs: number,
  peaks?: number[] | null,
): WordCue[] {
  if (!display.length) return display;
  const heard = timed?.length ? normalizeCueUnits(timed, durationMs) : [];
  if (heard.length === display.length && heard[0].startMs >= 200) {
    return display.map((word, index) => ({
      ...word,
      startMs: heard[index].startMs,
      endMs: heard[index].endMs,
      cued: true,
    }));
  }
  const peakWindow = speechWindowFromPeaks(peaks, durationMs);
  const startMs = Math.max(heard[0]?.startMs ?? 0, peakWindow.startMs);
  const heardEnd = heard.length ? heard[heard.length - 1].endMs : 0;
  const endMs = Math.max(
    startMs + display.length * 80,
    heardEnd > startMs ? heardEnd : peakWindow.endMs || durationMs,
  );
  if (startMs < 200 && endMs >= Math.max(durationMs - 250, startMs + 80)) {
    return alignWordCues(display, durationMs, peaks);
  }
  return estimateWordCues(textFromWords(display), durationMs, { startMs, endMs }).map((cue, index) => ({
    ...cue,
    word: display[index]?.word || cue.word,
    cued: Boolean(heard.length),
  }));
}

export function timingsLookUntrusted(words: WordCue[], durationMs: number): boolean {
  if (!words.length) return false;
  const first = words[0].startMs;
  const last = words[words.length - 1].endMs;
  const noneCued = words.every((item) => !item.cued);
  if (first < 280) return true;
  return noneCued && last > durationMs * 0.92 && first < durationMs * 0.12;
}

export function wordsForTake(
  text: string,
  durationMs: number,
  stored?: WordCue[] | null,
  peaks?: number[] | null,
): WordCue[] {
  const tokens = tokenizeWords(text);
  if (!tokens.length) return [];
  const window = speechWindowFromPeaks(peaks, durationMs);
  const storedOk =
    Boolean(stored?.length) && stored!.map((item) => item.word).join(' ') === tokens.join(' ');
  const guessed = storedOk && stored![0].startMs < 80 && stored!.every((item) => !item.cued);
  const words = storedOk && !guessed ? stored! : estimateWordCues(text, durationMs, window);
  return alignWordCues(words, durationMs, peaks);
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
  const parts = tokenizeWords(word);
  const target = words[index];
  if (!parts.length || !target) return words;
  if (parts.length === 1) {
    return words.map((item, i) => (i === index ? { ...item, word: parts[0], cued: true } : item));
  }
  const span = Math.max(1, target.endMs - target.startMs);
  const insert = parts.map((next, i) => ({
    word: next,
    startMs: target.startMs + (span * i) / parts.length,
    endMs: target.startMs + (span * (i + 1)) / parts.length,
    cued: true,
  }));
  return [...words.slice(0, index), ...insert, ...words.slice(index + 1)];
}

export function activeWordIndex(words: WordCue[], positionMs: number): number {
  if (!words.length) return -1;
  if (positionMs < words[0].startMs) return -1;
  for (let i = words.length - 1; i >= 0; i--) {
    if (positionMs >= words[i].startMs) return i;
  }
  return -1;
}
