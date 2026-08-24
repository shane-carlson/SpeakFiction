const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const license = require('./license.cjs');

const DEFAULT_NOTES_URL = 'https://www.readywriter.one';
const CRYPTO_SALT = 'speakfiction-notes-v1:';
const ACCOUNT_SALT = 'speakfiction-account-v1:';
const SF_KEY_RE = /^SF-[A-Za-z0-9-]{8,}$/;

function electronApp() {
  try {
    const electron = require('electron');
    if (electron && typeof electron === 'object' && electron.app) return electron.app;
  } catch {
    /* tests */
  }
  return null;
}

function notesUrl() {
  const fromEnv = typeof process.env.SF_NOTES_URL === 'string' ? process.env.SF_NOTES_URL.trim() : '';
  return (fromEnv || DEFAULT_NOTES_URL).replace(/\/$/, '');
}

function localPath() {
  const app = electronApp();
  const dir = app ? app.getPath('userData') : os.tmpdir();
  return path.join(dir, 'voice-notes-local.json');
}

function readLocal() {
  try {
    const raw = JSON.parse(fs.readFileSync(localPath(), 'utf8'));
    return Array.isArray(raw?.notes) ? raw.notes : [];
  } catch {
    return [];
  }
}

function writeLocal(notes) {
  const dir = path.dirname(localPath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(localPath(), `${JSON.stringify({ notes, updatedAt: new Date().toISOString() }, null, 2)}\n`);
}

function hex(buffer) {
  return Buffer.from(buffer).toString('hex');
}

async function sha256(text) {
  const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return digest;
}

async function accountHash(key) {
  return hex(await sha256(`${ACCOUNT_SALT}${key}`));
}

async function cryptoKey(key) {
  const material = await sha256(`${CRYPTO_SALT}${key}`);
  return webcrypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptPayload(key, payload) {
  const cryptoKeyObj = await cryptoKey(key);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const ct = new Uint8Array(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKeyObj, encoded));
  return {
    v: 1,
    iv: Buffer.from(iv).toString('base64'),
    ct: Buffer.from(ct).toString('base64'),
  };
}

async function decryptPayload(key, envelope) {
  if (!envelope || envelope.v !== 1 || typeof envelope.iv !== 'string' || typeof envelope.ct !== 'string') {
    return { kind: 'note', text: '', books: [] };
  }
  const cryptoKeyObj = await cryptoKey(key);
  const iv = Uint8Array.from(Buffer.from(envelope.iv, 'base64'));
  const ct = Uint8Array.from(Buffer.from(envelope.ct, 'base64'));
  const raw = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKeyObj, ct);
  const parsed = JSON.parse(new TextDecoder().decode(raw));
  return {
    kind: parsed.kind === 'library' || parsed.kind === 'create-book' ? parsed.kind : 'note',
    text: typeof parsed.text === 'string' ? parsed.text : '',
    title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : undefined,
    bookId: typeof parsed.bookId === 'string' && parsed.bookId.trim() ? parsed.bookId.trim() : undefined,
    bookHint: typeof parsed.bookHint === 'string' && parsed.bookHint.trim() ? parsed.bookHint.trim() : undefined,
    books: Array.isArray(parsed.books) ? parsed.books : [],
    genreId: typeof parsed.genreId === 'string' ? parsed.genreId : undefined,
    id: typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id.trim() : undefined,
    seriesName: typeof parsed.seriesName === 'string' && parsed.seriesName.trim() ? parsed.seriesName.trim() : undefined,
    seriesBookNumber:
      typeof parsed.seriesBookNumber === 'number' && Number.isFinite(parsed.seriesBookNumber) && parsed.seriesBookNumber > 0
        ? parsed.seriesBookNumber
        : typeof parsed.seriesBookNumber === 'string' && Number(parsed.seriesBookNumber) > 0
          ? Number(parsed.seriesBookNumber)
          : undefined,
    audio:
      parsed.audio && typeof parsed.audio === 'object' && typeof parsed.audio.data === 'string' && parsed.audio.data
        ? {
            mime: typeof parsed.audio.mime === 'string' && parsed.audio.mime.trim() ? parsed.audio.mime.trim() : 'audio/mp4',
            data: parsed.audio.data,
          }
        : undefined,
  };
}

function audioDir() {
  const app = electronApp();
  const dir = path.join(app ? app.getPath('userData') : os.tmpdir(), 'voice-notes-audio');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeNoteAudio(id, mime, dataB64) {
  removeNoteAudio(id);
  const ext = /wav/i.test(mime) ? 'wav' : /caf/i.test(mime) ? 'caf' : 'm4a';
  const dest = path.join(audioDir(), `${id}.${ext}`);
  fs.writeFileSync(dest, Buffer.from(dataB64, 'base64'));
  fs.writeFileSync(`${dest}.meta.json`, `${JSON.stringify({ mime })}\n`);
  return dest;
}

function noteAudioExists(id) {
  try {
    return fs.readdirSync(audioDir()).some((name) => name.startsWith(`${id}.`) && !name.endsWith('.json'));
  } catch {
    return false;
  }
}

function readNoteAudio(id) {
  try {
    const found = fs.readdirSync(audioDir()).find((name) => name.startsWith(`${id}.`) && !name.endsWith('.json'));
    if (!found) return { ok: false, message: 'That take has no audio on this computer. Send it again from the phone.' };
    const dest = path.join(audioDir(), found);
    let mime = 'audio/mp4';
    try {
      mime = JSON.parse(fs.readFileSync(`${dest}.meta.json`, 'utf8')).mime || mime;
    } catch {
      /* default mime */
    }
    return { ok: true, mime, bytes: Array.from(fs.readFileSync(dest)) };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Could not read that take.' };
  }
}

function removeNoteAudio(id) {
  try {
    for (const name of fs.readdirSync(audioDir())) {
      if (!name.startsWith(`${id}.`)) continue;
      try {
        fs.unlinkSync(path.join(audioDir(), name));
      } catch {
        /* keep going */
      }
    }
  } catch {
    /* nothing stored */
  }
}

function isHiddenNote(note) {
  const id = String(note?.id || '');
  return id === 'sf_library' || id.startsWith('sf_book_') || note?.kind === 'library' || note?.kind === 'create-book';
}

function storedKey() {
  return license.getStoredKey();
}

function pairingStatus() {
  const key = storedKey();
  return {
    paired: Boolean(key),
    displayKey: license.displayKey(key),
    canSync: SF_KEY_RE.test(key),
  };
}

function pairingMaterial() {
  const key = storedKey();
  if (!SF_KEY_RE.test(key)) {
    return {
      ok: false,
      message: 'Activate a SpeakFiction license on this computer first. The QR code appears after that.',
      ...pairingStatus(),
    };
  }
  const payload = `speakfiction://pair?v=1&k=${encodeURIComponent(key)}`;
  return {
    ok: true,
    key,
    payload,
    ...pairingStatus(),
  };
}

let sessionToken = '';
let sessionAccount = '';

async function openSession() {
  const key = storedKey();
  if (!SF_KEY_RE.test(key)) {
    return { ok: false, message: 'Activate a SpeakFiction license to sync phone notes. You can still import audio here.' };
  }
  const res = await fetch(`${notesUrl()}/api/speakfiction/notes/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ licenseKey: key, website: '' }),
  });
  const payload = await res.json().catch(() => null);
  if (!payload || payload.ok !== true || !payload.token) {
    return { ok: false, message: payload?.message || 'Could not open a notes session.' };
  }
  sessionToken = payload.token;
  sessionAccount = payload.accountHash || (await accountHash(key));
  return { ok: true, accountHash: sessionAccount };
}

async function refreshRemote() {
  const key = storedKey();
  if (!SF_KEY_RE.test(key)) return { ok: true, notes: readLocal() };
  const session = sessionToken ? { ok: true } : await openSession();
  if (!session.ok) return { ok: false, message: session.message, notes: readLocal() };
  const res = await fetch(`${notesUrl()}/api/speakfiction/notes/inbox`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${sessionToken}` },
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.ok || !Array.isArray(payload.notes)) {
    return { ok: false, message: payload?.message || 'Could not load voice notes.', notes: readLocal() };
  }
  const remote = [];
  const pendingBooks = [];
  const deletedIds = [];
  let books = [];
  for (const row of payload.notes) {
    if (row.status === 'deleted') {
      deletedIds.push(row.id);
      continue;
    }
    const opened = await decryptPayload(key, row.ciphertext).catch(() => ({ kind: 'note', text: '', books: [] }));
    if (opened.kind === 'library' || row.id === 'sf_library') {
      books = Array.isArray(opened.books) ? opened.books : [];
      continue;
    }
    if (opened.kind === 'create-book' || String(row.id).startsWith('sf_book_')) {
      if ((row.status || 'inbox') === 'inbox') {
        pendingBooks.push({
          id: opened.id || String(row.id).replace(/^sf_book_/, ''),
          title: opened.title || row.fileName || 'Untitled book',
          genreId: opened.genreId || 'generic',
          seriesName: opened.seriesName,
          seriesBookNumber: opened.seriesBookNumber,
        });
      }
      continue;
    }
    if (opened.audio?.data) writeNoteAudio(row.id, opened.audio.mime, opened.audio.data);
    remote.push({
      id: row.id,
      createdAt: row.createdAt,
      durationMs: Number(row.durationMs) || 0,
      platform: typeof row.platform === 'string' ? row.platform : 'phone',
      text: opened.text,
      title: opened.title,
      bookId: opened.bookId,
      bookHint: opened.bookHint || row.bookHint,
      status: row.status || 'inbox',
      source: row.source || 'phone',
      fileName: row.fileName,
      hasAudio: Boolean(row.hasAudio || opened.audio?.data || noteAudioExists(row.id)),
    });
  }
  for (const id of deletedIds) removeNoteAudio(id);
  const gone = new Set(deletedIds);
  const local = readLocal().filter((note) => !isHiddenNote(note) && !gone.has(note.id));
  const byId = new Map(remote.map((n) => [n.id, n]));
  for (const note of local) {
    if (!byId.has(note.id)) byId.set(note.id, { ...note, hasAudio: Boolean(note.hasAudio || noteAudioExists(note.id)) });
  }
  const notes = [...byId.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  writeLocal(notes);
  return { ok: true, notes, books, pendingBooks };
}

async function publishLibrary(books) {
  const key = storedKey();
  if (!SF_KEY_RE.test(key)) return { ok: false, message: 'Activate a SpeakFiction license first.' };
  const catalog = Array.isArray(books) ? books : [];
  try {
    if (!sessionToken) await openSession();
    if (!sessionToken) return { ok: false, message: 'Could not open a notes session.' };
    await fetch(`${notesUrl()}/api/speakfiction/notes/inbox`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        id: 'sf_library',
        createdAt: new Date().toISOString(),
        durationMs: 0,
        platform: 'desktop',
        status: 'imported',
        source: 'catalog',
        fileName: 'library.json',
        hasAudio: false,
        ciphertext: await encryptPayload(key, { kind: 'library', books: catalog }),
      }),
    });
    return { ok: true, books: catalog };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Could not publish the book list.' };
  }
}

async function addLocal(note) {
  const notes = readLocal();
  const next = [note, ...notes.filter((n) => n.id !== note.id)];
  writeLocal(next);
  const key = storedKey();
  if (SF_KEY_RE.test(key) && note.text) {
    try {
      if (!sessionToken) await openSession();
      if (sessionToken) {
        await fetch(`${notesUrl()}/api/speakfiction/notes/inbox`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            id: note.id,
            createdAt: note.createdAt,
            durationMs: note.durationMs,
            platform: note.platform,
            status: note.status,
            source: note.source,
            fileName: note.fileName,
            hasAudio: false,
            ciphertext: await encryptPayload(key, {
              kind: 'note',
              text: note.text,
              title: note.title,
              bookId: note.bookId,
              bookHint: note.bookHint,
            }),
          }),
        });
      }
    } catch {
      /* local inbox still has the take */
    }
  }
  return { ok: true, notes: next };
}

async function setStatus(id, status, extra) {
  if (status === 'deleted' || status === 'dismissed') removeNoteAudio(id);
  const patch = extra && typeof extra === 'object' ? extra : {};
  const safe = {};
  if (typeof patch.text === 'string') safe.text = patch.text;
  if (typeof patch.hasAudio === 'boolean') safe.hasAudio = patch.hasAudio;
  if (Number.isFinite(Number(patch.durationMs))) safe.durationMs = Number(patch.durationMs);
  const notes =
    status === 'deleted'
      ? readLocal().filter((n) => n.id !== id)
      : readLocal().map((n) => (n.id === id ? { ...n, ...safe, status } : n));
  writeLocal(notes);
  if (sessionToken) {
    try {
      await fetch(`${notesUrl()}/api/speakfiction/notes/inbox`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ id, status: status === 'dismissed' ? 'deleted' : status }),
      });
    } catch {
      /* local status still updated */
    }
  }
  return { ok: true, notes };
}

function list() {
  return {
    ok: true,
    notes: readLocal().filter((note) => !isHiddenNote(note) && note.status !== 'deleted'),
    ...pairingStatus(),
  };
}

module.exports = {
  pairingStatus,
  pairingMaterial,
  list,
  refreshRemote,
  publishLibrary,
  addLocal,
  setStatus,
  readNoteAudio,
  openSession,
  DEFAULT_NOTES_URL,
};
