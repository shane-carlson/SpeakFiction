// Manuscript pictures in userData. Kept next to library-state.json so they
// survive quit without stuffing binaries into the JSON (or git).
const fs = require('node:fs');
const path = require('node:path');

const MIME_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

function electronApp() {
  try {
    const electron = require('electron');
    if (electron && typeof electron === 'object' && electron.app) return electron.app;
  } catch {
    /* tests / scripts */
  }
  return null;
}

function mediaDir() {
  const app = electronApp();
  if (!app) return null;
  return path.join(app.getPath('userData'), 'manuscript-media');
}

function safeId(id) {
  return String(id || '').replace(/[^A-Za-z0-9._-]/g, '');
}

function filePath(id, mime) {
  const dir = mediaDir();
  const clean = safeId(id);
  if (!dir || !clean) return null;
  const ext = MIME_EXT[mime] || '.bin';
  return path.join(dir, `${clean}${ext}`);
}

function findExisting(id) {
  const dir = mediaDir();
  const clean = safeId(id);
  if (!dir || !clean) return null;
  const exts = ['.png', '.jpg', '.gif', '.webp', '.bin'];
  for (const ext of exts) {
    const dest = path.join(dir, `${clean}${ext}`);
    if (fs.existsSync(dest)) return dest;
  }
  return null;
}

function mimeFromPath(dest) {
  const ext = path.extname(dest).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function save(payload) {
  const id = safeId(payload?.id);
  const mime = payload?.mime;
  const dest = filePath(id, mime);
  if (!dest) return { ok: false };
  const bytes = payload?.bytes;
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const prev = findExisting(id);
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dest);
  if (prev && prev !== dest) {
    try {
      fs.unlinkSync(prev);
    } catch {
      /* ignore */
    }
  }
  return { ok: true };
}

function load(id) {
  const dest = findExisting(id);
  if (!dest) return { ok: false };
  try {
    const buf = fs.readFileSync(dest);
    return { ok: true, mime: mimeFromPath(dest), bytes: Uint8Array.from(buf) };
  } catch {
    return { ok: false };
  }
}

function remove(id) {
  const dest = findExisting(id);
  if (!dest) return { ok: true };
  try {
    fs.unlinkSync(dest);
  } catch {
    /* missing is fine */
  }
  return { ok: true };
}

module.exports = { save, load, remove, mediaDir };
