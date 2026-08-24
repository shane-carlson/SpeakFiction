import { tokenizeWords, type WordCue } from './wordCues';

export type SpeechCue = {
  word: string;
  heard?: string;
  takeId?: string;
  audioUri?: string | null;
  startMs?: number;
  endMs?: number;
};

export type TaughtPair = {
  heard: string;
  word: string;
  startMs?: number;
  endMs?: number;
};

const VOCAB_PATH = 'AppLibrary/speech-vocab.json';

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function foldToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

export function looksLikeCorrection(heard: string, word: string): boolean {
  const h = foldToken(heard);
  const w = foldToken(word);
  if (!h || !w || h === w) return false;
  if (h.length < 2 || w.length < 2) return false;
  const dist = levenshtein(h, w);
  const maxLen = Math.max(h.length, w.length);
  if (h[0] === w[0] && dist <= Math.max(2, Math.floor(maxLen * 0.45))) return true;
  if (shortNameRhyme(h, w)) return true;
  return dist / maxLen <= 0.45;
}

function isShortToken(value: string): boolean {
  return value.length >= 2 && value.length <= 4 && !/\s/.test(value);
}

/** Fae / fay / stay share a vowel when on-device STT guesses a common word. */
function shortNameRhyme(a: string, b: string): boolean {
  if (!isShortToken(a) || !isShortToken(b)) return false;
  const stem = (s: string) =>
    s
      .toLowerCase()
      .replace(/^(st|th|sh|ph|f|s)/, '')
      .replace(/ae|ay|ey|ei|a$/g, 'AY');
  const left = stem(a);
  const right = stem(b);
  return Boolean(left) && left === right;
}

const NAME_STOP = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'if',
  'so',
  'i',
  'im',
  'he',
  'she',
  'it',
  'we',
  'they',
]);

export function looksLikeName(token: string): boolean {
  const trimmed = token.trim();
  if (!/^[A-Z]/.test(trimmed)) return false;
  const folded = foldToken(trimmed);
  return folded.length >= 2 && !NAME_STOP.has(folded);
}

export function correctionsFromEdit(previous: string, next: string): TaughtPair[] {
  const a = tokenizeWords(previous);
  const b = tokenizeWords(next);
  if (!a.length || !b.length) return [];
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = foldToken(a[i - 1]) === foldToken(b[j - 1]) ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const pairs: TaughtPair[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && foldToken(a[i - 1]) === foldToken(b[j - 1])) {
      i -= 1;
      j -= 1;
      continue;
    }
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      if (looksLikeCorrection(a[i - 1], b[j - 1]) || looksLikeName(b[j - 1])) {
        pairs.push({ heard: a[i - 1], word: b[j - 1] });
      }
      i -= 1;
      j -= 1;
      continue;
    }
    if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      if (looksLikeName(b[j - 1])) pairs.push({ heard: '', word: b[j - 1] });
      j -= 1;
      continue;
    }
    if (i > 0) i -= 1;
    else j -= 1;
  }
  return pairs.reverse();
}

function cueKey(cue: Pick<SpeechCue, 'word' | 'heard'>): string {
  const heard = normalize(cue.heard || '').toLowerCase();
  if (heard) return `h:${heard}`;
  return `w:${normalize(cue.word).toLowerCase()}`;
}

async function fileSystem() {
  try {
    return await import('expo-file-system');
  } catch {
    return null;
  }
}

function parseVocab(raw: unknown): SpeechCue[] {
  if (!Array.isArray(raw)) return [];
  const cues: SpeechCue[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const word = normalize(typeof rec.word === 'string' ? rec.word : '');
    if (!word) continue;
    const heard = typeof rec.heard === 'string' && rec.heard.trim() ? rec.heard.trim() : undefined;
    const key = cueKey({ word, heard });
    if (seen.has(key)) continue;
    seen.add(key);
    cues.push({
      word,
      heard,
      takeId: typeof rec.takeId === 'string' ? rec.takeId : undefined,
      audioUri: typeof rec.audioUri === 'string' ? rec.audioUri : null,
      startMs: Number.isFinite(Number(rec.startMs)) ? Number(rec.startMs) : undefined,
      endMs: Number.isFinite(Number(rec.endMs)) ? Number(rec.endMs) : undefined,
    });
  }
  return cues.slice(0, 200);
}

export async function loadSpeechVocab(): Promise<SpeechCue[]> {
  try {
    const FileSystem = await fileSystem();
    const root = FileSystem?.documentDirectory;
    if (!root) return [];
    const uri = `${root}${VOCAB_PATH}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return [];
    return parseVocab(JSON.parse(await FileSystem.readAsStringAsync(uri)));
  } catch {
    return [];
  }
}

export async function saveSpeechVocab(cues: SpeechCue[]): Promise<SpeechCue[]> {
  const FileSystem = await fileSystem();
  const root = FileSystem?.documentDirectory;
  if (!root) return parseVocab(cues);
  const next = parseVocab(cues);
  const dir = `${root}AppLibrary/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  await FileSystem.writeAsStringAsync(`${root}${VOCAB_PATH}`, JSON.stringify(next));
  return next;
}

export function mergeSpeechCues(cues: SpeechCue[], incoming: SpeechCue[]): SpeechCue[] {
  const next = [...cues];
  for (const item of incoming) {
    const word = normalize(item.word);
    if (!word) continue;
    const heard = normalize(item.heard || '') || undefined;
    const key = cueKey({ word, heard });
    const idx = next.findIndex((cue) => cueKey(cue) === key);
    const cue: SpeechCue = { ...item, word, heard };
    if (idx >= 0) next.splice(idx, 1);
    next.unshift(cue);
  }
  return parseVocab(next);
}

export async function upsertSpeechCues(cues: SpeechCue[], incoming: SpeechCue[]): Promise<SpeechCue[]> {
  return saveSpeechVocab(mergeSpeechCues(cues, incoming));
}

export async function upsertSpeechCue(cues: SpeechCue[], next: SpeechCue): Promise<SpeechCue[]> {
  return upsertSpeechCues(cues, [next]);
}

export function contextualStrings(cues: SpeechCue[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const cue of cues) {
    for (const value of [cue.word, cue.heard]) {
      const next = normalize(value || '');
      if (!next) continue;
      const key = next.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(next);
    }
  }
  return out.slice(0, 100);
}

export function applyVocab(text: string, cues: SpeechCue[]): string {
  let next = text;
  for (const cue of cues) {
    const heard = normalize(cue.heard || '');
    const word = normalize(cue.word);
    if (!heard || !word || heard.toLowerCase() === word.toLowerCase()) continue;
    next = next.replace(new RegExp(`\\b${heard.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), word);
  }
  return next;
}

export function applyVocabToWords(words: WordCue[], cues: SpeechCue[]): WordCue[] {
  return words.map((item) => {
    const word = applyVocab(item.word, cues);
    return word === item.word ? item : { ...item, word };
  });
}

export function taughtWordSet(cues: SpeechCue[]): Set<string> {
  return new Set(cues.map((item) => item.word.toLowerCase()));
}
