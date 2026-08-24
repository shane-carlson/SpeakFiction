export type SpeechCue = {
  word: string;
  heard?: string;
  takeId?: string;
  audioUri?: string | null;
  startMs?: number;
  endMs?: number;
};

const VOCAB_PATH = 'AppLibrary/speech-vocab.json';

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
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
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cues.push({
      word,
      heard: typeof rec.heard === 'string' && rec.heard.trim() ? rec.heard.trim() : undefined,
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

export async function upsertSpeechCue(cues: SpeechCue[], next: SpeechCue): Promise<SpeechCue[]> {
  const word = normalize(next.word);
  if (!word) return cues;
  const rest = cues.filter((item) => item.word.toLowerCase() !== word.toLowerCase());
  return saveSpeechVocab([{ ...next, word }, ...rest]);
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

export function taughtWordSet(cues: SpeechCue[]): Set<string> {
  return new Set(cues.map((item) => item.word.toLowerCase()));
}
