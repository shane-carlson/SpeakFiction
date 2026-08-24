import type { VoiceNote, VoiceNoteStatus } from './voiceNotes';

export const DEFAULT_NOTES_API_BASE = 'https://www.readywriter.one';

export function notesApiBase(): string {
  return DEFAULT_NOTES_API_BASE;
}

export interface NotesSessionResult {
  ok: boolean;
  token?: string;
  accountHash?: string;
  message?: string;
}

export async function openNotesSession(licenseKey: string, base = notesApiBase()): Promise<NotesSessionResult> {
  const res = await fetch(`${base}/api/speakfiction/notes/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ licenseKey, website: '' }),
  });
  const payload = (await res.json().catch(() => null)) as NotesSessionResult | null;
  if (!payload || payload.ok !== true || !payload.token) {
    return {
      ok: false,
      message: payload?.message || 'Could not open a notes session. Check your connection and try again.',
    };
  }
  return payload;
}

export async function fetchNotesInbox(token: string, base = notesApiBase()): Promise<VoiceNote[]> {
  const res = await fetch(`${base}/api/speakfiction/notes/inbox`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const payload = (await res.json().catch(() => null)) as { ok?: boolean; notes?: VoiceNote[]; message?: string } | null;
  if (!res.ok || !payload?.ok || !Array.isArray(payload.notes)) {
    throw new Error(payload?.message || 'Could not load voice notes.');
  }
  return payload.notes;
}

export async function pushEncryptedNote(
  token: string,
  note: {
    id: string;
    createdAt: string;
    durationMs: number;
    platform: string;
    status?: VoiceNoteStatus;
    source?: string;
    fileName?: string;
    hasAudio?: boolean;
    ciphertext: unknown;
  },
  base = notesApiBase(),
): Promise<void> {
  const res = await fetch(`${base}/api/speakfiction/notes/inbox`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(note),
  });
  const payload = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
  if (!res.ok || !payload?.ok) {
    throw new Error(payload?.message || 'Could not send that note.');
  }
}

export async function patchNoteStatus(
  token: string,
  id: string,
  status: VoiceNoteStatus,
  base = notesApiBase(),
): Promise<void> {
  const res = await fetch(`${base}/api/speakfiction/notes/inbox`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ id, status }),
  });
  const payload = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
  if (!res.ok || !payload?.ok) {
    throw new Error(payload?.message || 'Could not update that note.');
  }
}
