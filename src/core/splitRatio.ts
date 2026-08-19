/** Dictation console / manuscript card (windowed Dictate tab). */
export const DICTATE_SPLIT_DEFAULT = 0.48;
export const DICTATE_SPLIT_MIN = 0.28;
export const DICTATE_SPLIT_MAX = 0.72;
export const DICTATE_SPLIT_MIN_PX = 240;

/** Full-screen manuscript editor: tools rail vs canvas. */
export const MANUSCRIPT_SPLIT_DEFAULT = 0.15;
export const MANUSCRIPT_SPLIT_MIN = 0.12;
export const MANUSCRIPT_SPLIT_MAX = 0.6;
export const MANUSCRIPT_SPLIT_MIN_PX = 180;

export function clampSplitRatio(
  next: number,
  width: number,
  {
    minRatio = DICTATE_SPLIT_MIN,
    maxRatio = DICTATE_SPLIT_MAX,
    minPx = DICTATE_SPLIT_MIN_PX,
    pinMid = true,
  }: {
    minRatio?: number;
    maxRatio?: number;
    minPx?: number;
    /** Keep 50% in range (dictation split). Off for a 15/85 editor rail. */
    pinMid?: boolean;
  } = {},
): number {
  const fromPx = width > 0 ? minPx / width : minRatio;
  let lo = Math.max(minRatio, fromPx);
  let hi = Math.min(maxRatio, width > 0 ? 1 - fromPx : maxRatio);
  if (pinMid) {
    lo = Math.min(0.5, lo);
    hi = Math.max(0.5, hi);
  }
  if (lo > hi) return pinMid ? 0.5 : (minRatio + maxRatio) / 2;
  if (!Number.isFinite(next)) return Math.min(hi, Math.max(lo, (minRatio + maxRatio) / 2));
  return Math.min(hi, Math.max(lo, next));
}

export function normalizeManuscriptSplit(value: unknown, fallback = MANUSCRIPT_SPLIT_DEFAULT): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value < MANUSCRIPT_SPLIT_MIN || value > MANUSCRIPT_SPLIT_MAX) return fallback;
  return value;
}

export function normalizeDictateSplit(value: unknown, fallback = DICTATE_SPLIT_DEFAULT): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value < DICTATE_SPLIT_MIN || value > DICTATE_SPLIT_MAX) return fallback;
  return value;
}
