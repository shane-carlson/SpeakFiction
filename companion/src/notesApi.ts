const DEFAULT_BASE = 'https://www.readywriter.one';

export function notesApiBase(): string {
  const fromEnv =
    typeof process.env.EXPO_PUBLIC_NOTES_URL === 'string' ? process.env.EXPO_PUBLIC_NOTES_URL.trim() : '';
  return (fromEnv || DEFAULT_BASE).replace(/\/$/, '');
}

export async function openNotesSession(licenseKey: string): Promise<{ token: string; accountHash: string }> {
  const res = await fetch(`${notesApiBase()}/api/speakfiction/notes/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ licenseKey, website: '' }),
  });
  const payload = (await res.json().catch(() => null)) as {
    ok?: boolean;
    token?: string;
    accountHash?: string;
    message?: string;
  } | null;
  if (!payload?.ok || !payload.token || !payload.accountHash) {
    throw new Error(payload?.message || 'Could not open a notes session.');
  }
  return { token: payload.token, accountHash: payload.accountHash };
}

export async function pushNote(
  token: string,
  note: {
    id: string;
    createdAt: string;
    durationMs: number;
      platform: string;
      fileName?: string;
      ciphertext: unknown;
      hasAudio?: boolean;
    },
  ): Promise<void> {
    const res = await fetch(`${notesApiBase()}/api/speakfiction/notes/inbox`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...note,
        source: 'phone',
        status: 'inbox',
        fileName: note.fileName || '',
        hasAudio: Boolean(note.hasAudio),
      }),
    });
  const payload = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
  if (!res.ok || !payload?.ok) {
    if (res.status === 413) {
      throw new Error(payload?.message || 'That take is too large to send. Try a shorter recording.');
    }
    throw new Error(payload?.message || 'Could not send that note.');
  }
}

export async function patchNoteStatus(
  token: string,
  id: string,
  status: 'inbox' | 'imported' | 'dismissed' | 'deleted',
): Promise<void> {
  const res = await fetch(`${notesApiBase()}/api/speakfiction/notes/inbox`, {
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
    throw new Error(payload?.message || 'Could not update that note on the computer.');
  }
}

export async function listNotes(token: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${notesApiBase()}/api/speakfiction/notes/inbox`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const payload = (await res.json().catch(() => null)) as { ok?: boolean; notes?: Array<Record<string, unknown>> } | null;
  if (!res.ok || !payload?.ok || !Array.isArray(payload.notes)) {
    throw new Error('Could not load notes.');
  }
  return payload.notes;
}
