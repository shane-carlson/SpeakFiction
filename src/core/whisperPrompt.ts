import { isRemoteVoiceTakePlaceholder } from './voiceNotes';

/** Whisper decoder prompt: names from the book/series library, kept short. */
export const LITERARY_WHISPER_PROMPT =
  'Literary fiction narration in clear English prose. Complete sentences. No timestamps.';

const MAX_PROMPT_CHARS = 400;
const MAX_INBOX_PROMPT_CHARS = 720;
const MAX_NAMES = 24;

export function whisperPrompt(names: string[] = []): string {
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(name);
    if (uniq.length >= MAX_NAMES) break;
  }
  if (!uniq.length) return LITERARY_WHISPER_PROMPT;
  const withNames = `${LITERARY_WHISPER_PROMPT} Names: ${uniq.join(', ')}.`;
  if (withNames.length <= MAX_PROMPT_CHARS) return withNames;
  return withNames.slice(0, MAX_PROMPT_CHARS - 1).replace(/,\s*[^,]*$/, '.') + '.';
}

/** Inbox refine: names plus a short phone transcript so desktop Whisper can reinterpret punctuation. */
export function whisperInboxPrompt(names: string[] = [], priorText?: string): string {
  const base = whisperPrompt(names);
  const prior = (priorText || '').replace(/\s+/g, ' ').trim();
  if (!prior || isRemoteVoiceTakePlaceholder(prior)) return base;
  const room = MAX_INBOX_PROMPT_CHARS - base.length - 12;
  if (room < 24) return base;
  const snippet = prior.length > room ? `${prior.slice(0, room).replace(/\s+\S*$/, '')}`.trim() : prior;
  if (!snippet) return base;
  return `${base} Phone take: ${snippet}`;
}
