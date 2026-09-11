// Per-book manuscript recovery points in userData. Kept beside
// library-state.json so versions survive quit without bloating the session JSON.
const fs = require('node:fs');
const path = require('node:path');

let overrideRoot = null;

function electronApp() {
  try {
    const electron = require('electron');
    if (electron && typeof electron === 'object' && electron.app) return electron.app;
  } catch {
    /* tests / scripts */
  }
  return null;
}

function safeId(id) {
  return String(id || '').replace(/[^A-Za-z0-9._-]/g, '');
}

function versionsRoot() {
  if (overrideRoot) return overrideRoot;
  if (process.env.SF_VERSIONS_DIR) return process.env.SF_VERSIONS_DIR;
  const app = electronApp();
  if (!app) return null;
  return path.join(app.getPath('userData'), 'manuscript-versions');
}

function bookDir(bookId) {
  const root = versionsRoot();
  const clean = safeId(bookId);
  if (!root || !clean) return null;
  return path.join(root, clean);
}

function indexPath(bookId) {
  const dir = bookDir(bookId);
  return dir ? path.join(dir, 'index.json') : null;
}

function pointPath(bookId, id) {
  const dir = bookDir(bookId);
  const clean = safeId(id);
  if (!dir || !clean) return null;
  return path.join(dir, `${clean}.json`);
}

function writeJson(dest, value) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value), 'utf8');
  fs.renameSync(tmp, dest);
}

function readJson(dest) {
  try {
    return JSON.parse(fs.readFileSync(dest, 'utf8'));
  } catch {
    return null;
  }
}

function metaFromPoint(point) {
  if (!point || typeof point !== 'object') return null;
  const { blocks, ...meta } = point;
  return meta;
}

function readIndex(bookId) {
  const dest = indexPath(bookId);
  if (!dest) return [];
  const parsed = readJson(dest);
  const list = parsed && typeof parsed === 'object' && Array.isArray(parsed.points) ? parsed.points : [];
  return list.filter((item) => item && typeof item === 'object' && typeof item.id === 'string');
}

function writeIndex(bookId, points) {
  const dest = indexPath(bookId);
  if (!dest) return;
  writeJson(dest, { version: 1, points });
}

function list(bookId) {
  const dest = bookDir(bookId);
  if (!dest) return { ok: false, points: [] };
  const points = readIndex(bookId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { ok: true, points };
}

function load(bookId, id) {
  const dest = pointPath(bookId, id);
  if (!dest) return { ok: false };
  const point = readJson(dest);
  if (!point) return { ok: false };
  return { ok: true, point };
}

function save(point) {
  const bookId = point?.bookId;
  const id = point?.id;
  const dest = pointPath(bookId, id);
  if (!dest) return { ok: false };
  writeJson(dest, point);
  const next = [metaFromPoint(point), ...readIndex(bookId).filter((item) => item.id !== id)];
  writeIndex(bookId, next);
  return { ok: true };
}

function remove(bookId, id) {
  const dest = pointPath(bookId, id);
  if (dest) {
    try {
      fs.unlinkSync(dest);
    } catch {
      /* missing is fine */
    }
  }
  writeIndex(
    bookId,
    readIndex(bookId).filter((item) => item.id !== id),
  );
  return { ok: true };
}

function removeBook(bookId) {
  const dir = bookDir(bookId);
  if (!dir) return { ok: false };
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* missing is fine */
  }
  return { ok: true };
}

function setRoot(dir) {
  overrideRoot = dir || null;
}

module.exports = { list, load, save, remove, removeBook, setRoot, versionsRoot };
