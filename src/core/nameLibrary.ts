import type { NameEntry } from './types';
import { normalizeToken, similarity, soundex } from './phonetics';

export interface NameCorrectionOptions {
  /** Minimum edit-distance similarity to accept a match. */
  minSimilarity?: number;
  /** Lower similarity accepted when the soundex phonetic code also matches. */
  soundexFallbackSimilarity?: number;
  /** Longest multi-word name (in words) to attempt to match. */
  maxNgram?: number;
  /** Word frequencies from the adaptive model; boosts learned names. */
  vocabularyBoost?: Record<string, number>;
}

export interface AppliedCorrection {
  from: string;
  to: string;
  score: number;
  entryId: string;
}

export interface NameCorrectionResult {
  text: string;
  applied: AppliedCorrection[];
}

interface IndexedForm {
  entry: NameEntry;
  normalized: string;
  phonetic: string;
  wordCount: number;
}

export interface NameIndex {
  formsByWordCount: Map<number, IndexedForm[]>;
  maxWordCount: number;
}

const DEFAULTS: Required<Omit<NameCorrectionOptions, 'vocabularyBoost'>> = {
  minSimilarity: 0.8,
  soundexFallbackSimilarity: 0.6,
  maxNgram: 3,
};

function phoneticKey(normalized: string): string {
  return normalized
    .split(/\s+/)
    .map((w) => soundex(w))
    .join('');
}

export function buildNameIndex(entries: NameEntry[]): NameIndex {
  const formsByWordCount = new Map<number, IndexedForm[]>();
  let maxWordCount = 1;

  for (const entry of entries) {
    const forms = new Set<string>([entry.canonical, ...entry.aliases]);
    for (const raw of forms) {
      const normalized = raw
        .split(/\s+/)
        .map(normalizeToken)
        .filter(Boolean)
        .join(' ');
      if (!normalized) continue;
      const wordCount = normalized.split(' ').length;
      maxWordCount = Math.max(maxWordCount, wordCount);
      const list = formsByWordCount.get(wordCount) ?? [];
      list.push({ entry, normalized, phonetic: phoneticKey(normalized), wordCount });
      formsByWordCount.set(wordCount, list);
    }
  }

  return { formsByWordCount, maxWordCount };
}

interface Candidate {
  entry: NameEntry;
  score: number;
}

function bestMatchForPhrase(
  index: NameIndex,
  phrase: string,
  wordCount: number,
  opts: Required<Omit<NameCorrectionOptions, 'vocabularyBoost'>>,
  vocabularyBoost: Record<string, number>,
): Candidate | null {
  const forms = index.formsByWordCount.get(wordCount);
  if (!forms) return null;

  const phrasePhonetic = phoneticKey(phrase);
  let best: Candidate | null = null;

  for (const form of forms) {
    if (form.normalized === phrase) {
      // Exact match always wins.
      return { entry: form.entry, score: 1 };
    }

    const sim = similarity(phrase, form.normalized);
    const soundexEqual = form.phonetic !== '' && form.phonetic === phrasePhonetic;
    const sameFirstLetter = phrase[0] === form.normalized[0];

    // Learned names get a small boost so the model adapts to the writer.
    const boost = vocabularyBoost[form.entry.canonical.toLowerCase()]
      ? Math.min(0.05, vocabularyBoost[form.entry.canonical.toLowerCase()] * 0.005)
      : 0;
    const score = sim + boost;

    const passesPrimary = score >= opts.minSimilarity && (sameFirstLetter || soundexEqual);
    const passesPhonetic = soundexEqual && score >= opts.soundexFallbackSimilarity;

    if (passesPrimary || passesPhonetic) {
      if (!best || score > best.score) {
        best = { entry: form.entry, score: Math.min(1, score) };
      }
    }
  }

  return best;
}

/** Restore leading/trailing punctuation that surrounded the matched window. */
function reattachPunctuation(original: string, replacement: string): string {
  const leading = original.match(/^[^a-z0-9]+/i)?.[0] ?? '';
  const trailing = original.match(/[^a-z0-9]+$/i)?.[0] ?? '';
  return leading + replacement + trailing;
}

/**
 * Replace phonetically/edit-distance-close spellings of trained names with
 * their canonical spelling. Multi-word names are matched greedily (longest
 * first) so "kel dros" becomes "Kaeldros".
 */
export function correctNames(
  text: string,
  entries: NameEntry[],
  options: NameCorrectionOptions = {},
): NameCorrectionResult {
  const opts = { ...DEFAULTS, ...options };
  const vocabularyBoost = options.vocabularyBoost ?? {};
  const index = buildNameIndex(entries);
  if (index.formsByWordCount.size === 0) return { text, applied: [] };

  const words = text.split(/(\s+)/); // keep whitespace tokens
  const wordIdx: number[] = [];
  words.forEach((w, i) => {
    if (w.trim() !== '') wordIdx.push(i);
  });

  const applied: AppliedCorrection[] = [];
  const maxN = Math.min(opts.maxNgram, index.maxWordCount);

  let k = 0;
  while (k < wordIdx.length) {
    let matched = false;
    for (let size = Math.min(maxN, wordIdx.length - k); size >= 1; size--) {
      const windowWordIdx = wordIdx.slice(k, k + size);
      const normalizedPhrase = windowWordIdx
        .map((i) => normalizeToken(words[i]))
        .filter(Boolean)
        .join(' ');
      if (!normalizedPhrase || normalizedPhrase.split(' ').length !== size) continue;

      const candidate = bestMatchForPhrase(index, normalizedPhrase, size, opts, vocabularyBoost);
      if (candidate) {
        const firstTokenIdx = windowWordIdx[0];
        const lastTokenIdx = windowWordIdx[size - 1];

        const leading = words[firstTokenIdx].match(/^[^a-z0-9]+/i)?.[0] ?? '';
        const trailing = words[lastTokenIdx].match(/[^a-z0-9]+$/i)?.[0] ?? '';

        // Collapse the whole matched window (words + interior whitespace) into
        // a single canonical token, preserving outer punctuation.
        words[firstTokenIdx] = leading + candidate.entry.canonical + trailing;
        for (let i = firstTokenIdx + 1; i <= lastTokenIdx; i++) words[i] = '';

        if (normalizedPhrase !== candidate.entry.canonical.toLowerCase()) {
          applied.push({
            from: normalizedPhrase,
            to: candidate.entry.canonical,
            score: candidate.score,
            entryId: candidate.entry.id,
          });
        }
        k += size;
        matched = true;
        break;
      }
    }
    if (!matched) k += 1;
  }

  return { text: words.join('').replace(/[ \t]{2,}/g, ' '), applied };
}

/** Convenience wrapper kept for symmetry / possible external callers. */
export function reattach(original: string, replacement: string): string {
  return reattachPunctuation(original, replacement);
}
