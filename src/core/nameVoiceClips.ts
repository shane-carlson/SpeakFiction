import { takeRepeatedName } from './newCharacterCue';
import { loadRawMedia, removeMedia, saveRawMedia } from './mediaStore';
import { encodePcmWav, NAME_VOICE_MIME } from './pcmWav';
import type { NameEntry, NameVoiceClip } from './types';
import { uid } from './util';

export const NAME_VOICE_TAKES = 2;

export function mergeNameVoiceClips(
  existing: NameVoiceClip[] | undefined,
  incoming: NameVoiceClip[] | undefined,
): NameVoiceClip[] | undefined {
  const out: NameVoiceClip[] = [];
  const seen = new Set<string>();
  for (const clip of [...(existing ?? []), ...(incoming ?? [])]) {
    if (!clip.mediaId || seen.has(clip.mediaId)) continue;
    seen.add(clip.mediaId);
    out.push({
      mediaId: clip.mediaId,
      heard: clip.heard?.trim() || undefined,
      source: clip.source,
    });
  }
  return out.length ? out : undefined;
}

export function heardAliasesFromClips(clips: NameVoiceClip[] | undefined, canonical: string): string[] {
  const key = canonical.trim().toLowerCase();
  const aliases: string[] = [];
  const seen = new Set<string>(key ? [key] : []);
  for (const clip of clips ?? []) {
    const heard = clip.heard?.trim();
    if (!heard) continue;
    const taken = takeRepeatedName(heard);
    const forms = taken ? [taken.first, taken.second] : [heard];
    for (const form of forms) {
      const trimmed = form.trim();
      const lower = trimmed.toLowerCase();
      if (!lower || seen.has(lower) || lower.includes('new character')) continue;
      seen.add(lower);
      aliases.push(trimmed);
    }
  }
  return aliases;
}

/** Dictation “New Character” already captured the two sayings; library add needs two takes. */
export function nameVoiceTrainingComplete(clips: NameVoiceClip[] | undefined): boolean {
  if (!clips?.length) return false;
  if (clips.some((c) => c.source === 'dictation')) return true;
  if (clips.length >= NAME_VOICE_TAKES) return true;
  return clips.some((c) => clipHasTwoSayings(c));
}

export function clipHasTwoSayings(clip: NameVoiceClip): boolean {
  const heard = clip.heard?.trim();
  if (!heard) return false;
  return Boolean(takeRepeatedName(heard));
}

export async function persistNameVoiceClip(
  samples: Float32Array,
  sampleRate: number,
  opts: { heard?: string; source?: NameVoiceClip['source'] } = {},
): Promise<NameVoiceClip> {
  const mediaId = uid('nvc');
  const bytes = encodePcmWav(samples, sampleRate);
  await saveRawMedia(mediaId, NAME_VOICE_MIME, bytes);
  return {
    mediaId,
    heard: opts.heard?.trim() || undefined,
    source: opts.source,
  };
}

export async function purgeNameVoiceClips(entry: Pick<NameEntry, 'voiceClips'> | undefined): Promise<void> {
  for (const clip of entry?.voiceClips ?? []) {
    await removeMedia(clip.mediaId);
  }
}

export async function playNameVoiceClip(clip: NameVoiceClip): Promise<void> {
  const loaded = await loadRawMedia(clip.mediaId);
  if (!loaded) throw new Error('That voice clip is missing.');
  const copy = new ArrayBuffer(loaded.bytes.byteLength);
  new Uint8Array(copy).set(loaded.bytes);
  const url = URL.createObjectURL(new Blob([copy], { type: loaded.mime || NAME_VOICE_MIME }));
  await new Promise<void>((resolve, reject) => {
    const audio = new Audio(url);
    const done = (err?: Error) => {
      URL.revokeObjectURL(url);
      if (err) reject(err);
      else resolve();
    };
    audio.onended = () => done();
    audio.onerror = () => done(new Error('Could not play the voice clip.'));
    void audio.play().catch((e) => done(e instanceof Error ? e : new Error('Could not play the voice clip.')));
  });
}

export async function playNameVoiceClips(clips: NameVoiceClip[] | undefined): Promise<void> {
  for (const clip of clips ?? []) {
    await playNameVoiceClip(clip);
  }
}
