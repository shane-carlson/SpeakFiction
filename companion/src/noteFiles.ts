const NOTES_DIR = 'VoiceNotes/';

export type ShareKind = 'none' | 'audio' | 'transcript' | 'both';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function noteBasename(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'SpeakFiction note';
  return `SpeakFiction ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}.${pad(date.getMinutes())}`;
}

export function audioExtension(uri: string): string {
  const match = uri.toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  if (match && ['m4a', 'caf', 'mp4', 'aac', 'wav', '3gp', 'mp3'].includes(match[1])) return match[1];
  return 'm4a';
}

export function shareKindFor(audioUri: string | null | undefined, text: string): ShareKind {
  const hasText = Boolean(text.trim());
  const hasAudio = Boolean(audioUri);
  if (hasAudio && hasText) return 'both';
  if (hasAudio) return 'audio';
  if (hasText) return 'transcript';
  return 'none';
}

function audioShareTypes(ext: string): { mimeType: string; UTI: string } {
  if (ext === 'wav') return { mimeType: 'audio/wav', UTI: 'com.microsoft.waveform-audio' };
  if (ext === 'mp3') return { mimeType: 'audio/mpeg', UTI: 'public.mp3' };
  if (ext === 'caf') return { mimeType: 'audio/x-caf', UTI: 'com.apple.coreaudio-format' };
  if (ext === '3gp') return { mimeType: 'audio/3gpp', UTI: 'public.3gpp' };
  return { mimeType: 'audio/mp4', UTI: 'public.mpeg-4-audio' };
}

async function fileSystem() {
  try {
    return await import('expo-file-system');
  } catch {
    throw new Error('Local files are not available on this phone. Rebuild the companion app.');
  }
}

async function sharing() {
  try {
    return await import('expo-sharing');
  } catch {
    throw new Error('Share is not available on this phone. Rebuild the companion app.');
  }
}

async function uniqueDest(dir: string, base: string, ext: string): Promise<string> {
  const FileSystem = await fileSystem();
  const first = `${dir}${base}.${ext}`;
  const info = await FileSystem.getInfoAsync(first);
  if (!info.exists) return first;
  return `${dir}${base}-${Date.now().toString(36)}.${ext}`;
}

export async function notesDirectory(): Promise<string> {
  const FileSystem = await fileSystem();
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('Local files are not available on this phone.');
  const dir = `${root}${NOTES_DIR}`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}

export async function keepAudioTake(sourceUri: string, createdAt: string): Promise<string> {
  const FileSystem = await fileSystem();
  const dir = await notesDirectory();
  const ext = audioExtension(sourceUri);
  const dest = await uniqueDest(dir, noteBasename(createdAt), ext);
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

export async function writeTranscriptTake(text: string, createdAt: string): Promise<string> {
  const FileSystem = await fileSystem();
  const cache = FileSystem.cacheDirectory;
  if (!cache) throw new Error('Could not make a copy to share.');
  const dest = `${cache}${noteBasename(createdAt)}.txt`;
  await FileSystem.writeAsStringAsync(dest, text);
  return dest;
}

export async function shareLocalFile(
  uri: string,
  options: { mimeType: string; UTI: string; dialogTitle: string },
): Promise<void> {
  const Sharing = await sharing();
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Share is not available on this phone.');
  }
  await Sharing.shareAsync(uri, options);
}

export async function shareAudioTake(uri: string): Promise<void> {
  const ext = audioExtension(uri);
  await shareLocalFile(uri, {
    ...audioShareTypes(ext),
    dialogTitle: 'Send voice note',
  });
}

export async function shareTranscriptTake(text: string, createdAt: string): Promise<void> {
  const uri = await writeTranscriptTake(text, createdAt);
  await shareLocalFile(uri, {
    mimeType: 'text/plain',
    UTI: 'public.plain-text',
    dialogTitle: 'Send transcript',
  });
}

export function isShareDismissed(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dismiss|cancel|did not share/i.test(message);
}
