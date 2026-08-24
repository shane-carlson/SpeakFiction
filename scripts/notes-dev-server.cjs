#!/usr/bin/env node
/**
 * Local SpeakFiction notes inbox for companion + desktop pairing tests.
 * Same routes as readywriter.one; accepts any SF- key and stores notes on disk.
 */
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.SF_NOTES_PORT || 8787);
const HOST = process.env.SF_NOTES_HOST || '0.0.0.0';
const ROOT = path.join(__dirname, '..');
const STORE = path.join(ROOT, '.notes-dev', 'inboxes.json');
const SECRET = process.env.SPEAKFICTION_NOTES_SECRET?.trim() || 'speakfiction-notes-dev';
const SF_RE = /^SF-[A-Za-z0-9-]{8,}$/;
const LIMIT = 200;

function lanAddresses() {
  const found = [];
  for (const rows of Object.values(os.networkInterfaces())) {
    for (const row of rows || []) {
      if (row.internal || row.family !== 'IPv4') continue;
      found.push(row.address);
    }
  }
  return found;
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

function accountHash(key) {
  return crypto.createHash('sha256').update(`speakfiction-account-v1:${key.trim()}`).digest('hex');
}

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64');
}

function createToken(hash) {
  const body = base64Url(JSON.stringify({ v: 1, sub: hash, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 }));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  return `${body}.${sig}`;
}

function readToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const claims = JSON.parse(fromBase64Url(body).toString('utf8'));
    if (claims.v !== 1 || typeof claims.sub !== 'string' || !claims.sub) return null;
    if (typeof claims.exp !== 'number' || claims.exp < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

function bearer(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function loadStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(STORE, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  fs.writeFileSync(STORE, `${JSON.stringify(store, null, 2)}\n`);
}

function inboxFor(store, hash) {
  const current = store[hash];
  if (current && Array.isArray(current.notes)) return current;
  return { accountHash: hash, updatedAt: new Date().toISOString(), notes: [] };
}

function sanitizeNote(value) {
  if (!value || typeof value !== 'object') return null;
  const rec = value;
  const id = typeof rec.id === 'string' ? rec.id.trim().slice(0, 80) : '';
  const ct = rec.ciphertext;
  if (!id || !ct || typeof ct !== 'object' || ct.v !== 1 || typeof ct.iv !== 'string' || typeof ct.ct !== 'string') {
    return null;
  }
  const now = new Date().toISOString();
  return {
    id,
    createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : now,
    updatedAt: now,
    durationMs: Math.max(0, Number(rec.durationMs) || 0),
    platform: typeof rec.platform === 'string' ? rec.platform : 'phone',
    status: ['inbox', 'imported', 'dismissed', 'deleted'].includes(rec.status) ? rec.status : 'inbox',
    source: typeof rec.source === 'string' ? rec.source : 'phone',
    fileName: typeof rec.fileName === 'string' ? rec.fileName : '',
    hasAudio: rec.hasAudio === true,
    ciphertext: { v: 1, iv: ct.iv, ct: ct.ct },
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') {
    json(res, 204, { ok: true });
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    json(res, 200, { ok: true, service: 'speakfiction-notes-dev', port: PORT });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/speakfiction/notes/session') {
    const body = await readBody(req);
    if ((typeof body.website === 'string' && body.website.trim()) || (typeof body.company === 'string' && body.company.trim())) {
      json(res, 200, { ok: true });
      return;
    }
    const licenseKey = String(body.licenseKey || body.key || '').trim();
    if (!SF_RE.test(licenseKey)) {
      json(res, 400, { ok: false, message: 'Paste an SF- key from SpeakFiction or Polar.' });
      return;
    }
    const hash = accountHash(licenseKey);
    json(res, 200, {
      ok: true,
      token: createToken(hash),
      accountHash: hash,
      companion: true,
      consumesDesktopSeat: false,
      blobReady: true,
    });
    return;
  }

  if (url.pathname === '/api/speakfiction/notes/inbox') {
    const claims = readToken(bearer(req));
    if (!claims) {
      json(res, 401, { ok: false, message: 'Sign in with your SF- license key.' });
      return;
    }
    const store = loadStore();
    const inbox = inboxFor(store, claims.sub);

    if (req.method === 'GET') {
      json(res, 200, {
        ok: true,
        notes: inbox.notes.map((note) => ({
          id: note.id,
          createdAt: note.createdAt,
          durationMs: note.durationMs,
          platform: note.platform,
          status: note.status,
          source: note.source,
          fileName: note.fileName,
          hasAudio: note.hasAudio,
          ciphertext: note.ciphertext,
        })),
      });
      return;
    }

    if (req.method === 'POST') {
      const note = sanitizeNote(await readBody(req));
      if (!note) {
        json(res, 400, { ok: false, message: 'That note was missing text ciphertext.' });
        return;
      }
      const notes = [note, ...inbox.notes.filter((item) => item.id !== note.id)].slice(0, LIMIT);
      store[claims.sub] = { accountHash: claims.sub, updatedAt: new Date().toISOString(), notes };
      saveStore(store);
      json(res, 200, { ok: true, id: note.id, count: notes.length });
      return;
    }

    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      const status = body.status;
      if (!id || !['inbox', 'imported', 'dismissed', 'deleted'].includes(status)) {
        json(res, 400, { ok: false, message: 'Choose a note and a status.' });
        return;
      }
      const now = new Date().toISOString();
      const notes = inbox.notes.map((note) => (note.id === id ? { ...note, status, updatedAt: now } : note));
      if (status === 'deleted' && !inbox.notes.some((note) => note.id === id)) {
        notes.push({
          id,
          createdAt: now,
          updatedAt: now,
          durationMs: 0,
          platform: 'phone',
          status: 'deleted',
          source: 'phone',
          fileName: '',
          hasAudio: false,
          ciphertext: { v: 1, iv: '', ct: '' },
        });
      }
      store[claims.sub] = { accountHash: claims.sub, updatedAt: new Date().toISOString(), notes };
      saveStore(store);
      json(res, 200, { ok: true, id, status });
      return;
    }
  }

  json(res, 404, { ok: false, message: 'Not found.' });
});

server.listen(PORT, HOST, () => {
  const lans = lanAddresses();
  console.log(`SpeakFiction notes test server on http://127.0.0.1:${PORT}`);
  for (const ip of lans) console.log(`  Phone / LAN: http://${ip}:${PORT}`);
  console.log('Accepts any SF- key. Inbox is stored in .notes-dev/inboxes.json');
});
