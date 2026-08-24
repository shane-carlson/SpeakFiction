import { parsePeaks, parseWordCues, type WordCue } from './wordCues';

export type { WordCue };

export type LibraryTake = {
  id: string;
  title: string;
  createdAt: string;
  durationMs: number;
  text: string;
  audioUri?: string | null;
  bookId?: string | null;
  bookTitle?: string | null;
  recordOnly?: boolean;
  sent?: boolean;
  exported?: boolean;
  words?: WordCue[];
  peaks?: number[];
};

const INDEX_PATH = 'AppLibrary/takes.json';
const MEDIA_DIR = 'AppLibrary/media/';

export function defaultTakeTitle(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'Voice note';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function createTakeId(): string {
  return `tk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function parseTakes(raw: unknown): LibraryTake[] {
  if (!Array.isArray(raw)) return [];
  const takes: LibraryTake[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id : '';
    const createdAt = typeof rec.createdAt === 'string' ? rec.createdAt : '';
    if (!id || !createdAt) continue;
    takes.push({
      id,
      title: typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : defaultTakeTitle(createdAt),
      createdAt,
      durationMs: Math.max(0, Number(rec.durationMs) || 0),
      text: typeof rec.text === 'string' ? rec.text : '',
      audioUri: typeof rec.audioUri === 'string' ? rec.audioUri : null,
      bookId: typeof rec.bookId === 'string' ? rec.bookId : null,
      bookTitle: typeof rec.bookTitle === 'string' ? rec.bookTitle : null,
      recordOnly: rec.recordOnly === true,
      sent: rec.sent === true,
      exported: rec.exported === true,
      words: parseWordCues(rec.words),
      peaks: parsePeaks(rec.peaks),
    });
  }
  return takes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function fileSystem() {
  try {
    return await import('expo-file-system');
  } catch {
    throw new Error('App storage is not available on this phone. Rebuild the companion app.');
  }
}

async function indexUri(): Promise<string> {
  const FileSystem = await fileSystem();
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('App storage is not available on this phone.');
  const dir = `${root}AppLibrary/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return `${root}${INDEX_PATH}`;
}

async function mediaDir(): Promise<string> {
  const FileSystem = await fileSystem();
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('App storage is not available on this phone.');
  const dir = `${root}${MEDIA_DIR}`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}

export async function loadTakes(): Promise<LibraryTake[]> {
  try {
    const FileSystem = await fileSystem();
    const uri = await indexUri();
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return [];
    return parseTakes(JSON.parse(await FileSystem.readAsStringAsync(uri)));
  } catch {
    return [];
  }
}

export async function saveTakes(takes: LibraryTake[]): Promise<LibraryTake[]> {
  const FileSystem = await fileSystem();
  const next = parseTakes(takes);
  await FileSystem.writeAsStringAsync(await indexUri(), JSON.stringify(next));
  return next;
}

export async function upsertTake(takes: LibraryTake[], patch: LibraryTake): Promise<LibraryTake[]> {
  const next = [patch, ...takes.filter((take) => take.id !== patch.id)];
  return saveTakes(next);
}

export async function removeTakes(takes: LibraryTake[], ids: string[]): Promise<LibraryTake[]> {
  const gone = new Set(ids);
  const FileSystem = await fileSystem();
  for (const take of takes) {
    if (!gone.has(take.id) || !take.audioUri) continue;
    try {
      await FileSystem.deleteAsync(take.audioUri, { idempotent: true });
    } catch {
      /* keep removing the rest */
    }
  }
  return saveTakes(takes.filter((take) => !gone.has(take.id)));
}

export async function keepLibraryAudio(takeId: string, sourceUri: string): Promise<string> {
  const FileSystem = await fileSystem();
  const ext = (sourceUri.toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/)?.[1] || 'm4a').replace(/[^a-z0-9]/g, '') || 'm4a';
  const dest = `${await mediaDir()}${takeId}.${ext}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

export async function exportTakeCopy(take: LibraryTake): Promise<string> {
  const FileSystem = await fileSystem();
  const cache = FileSystem.cacheDirectory;
  if (!cache) throw new Error('Could not make a copy to save outside the app.');
  const safe = take.title.replace(/[\\/:*?"<>|]/g, ' ').trim() || defaultTakeTitle(take.createdAt);
  if (take.audioUri) {
    const ext = take.audioUri.toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/)?.[1] || 'm4a';
    const dest = `${cache}${safe}.${ext}`;
    await FileSystem.copyAsync({ from: take.audioUri, to: dest });
    return dest;
  }
  if (take.text.trim()) {
    const dest = `${cache}${safe}.txt`;
    await FileSystem.writeAsStringAsync(dest, take.text);
    return dest;
  }
  throw new Error('That take has nothing to save to Files.');
}

/** Cipher JSON on the public notes host tops out near 4MB, so keep base64 under that. */
const AUDIO_ATTACH_MAX_B64 = 2_800_000;

export async function readTakeAudioAttachment(
  uri: string | null | undefined,
): Promise<{ mime: string; data: string } | null> {
  if (!uri) return null;
  const FileSystem = await fileSystem();
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) return null;
  const encoding = FileSystem.EncodingType?.Base64 ?? 'base64';
  const data = await FileSystem.readAsStringAsync(uri, { encoding });
  if (!data) return null;
  if (data.length > AUDIO_ATTACH_MAX_B64) {
    throw new Error('That take is too long to send to the computer. Try a shorter recording.');
  }
  const ext = uri.toLowerCase();
  const mime = ext.includes('.wav') ? 'audio/wav' : ext.includes('.caf') ? 'audio/x-caf' : 'audio/mp4';
  return { mime, data };
}
