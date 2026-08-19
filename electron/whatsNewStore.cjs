// Pending release notes saved when an update finishes downloading, so What’s
// New still has copy after restart even if GitHub is unreachable.
const fs = require('node:fs');
const path = require('node:path');

function electronApp() {
  try {
    const electron = require('electron');
    if (electron && typeof electron === 'object' && electron.app) return electron.app;
  } catch {
    /* tests / scripts */
  }
  return null;
}

function notesPath() {
  const app = electronApp();
  if (!app) return null;
  return path.join(app.getPath('userData'), 'whats-new.json');
}

function load() {
  const dest = notesPath();
  if (!dest) return null;
  try {
    const text = fs.readFileSync(dest, 'utf8');
    if (!text || !text.trim()) return null;
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    const version = typeof parsed.version === 'string' ? parsed.version.trim() : '';
    const notes = typeof parsed.notes === 'string' ? parsed.notes.trim() : '';
    if (!version || !notes) return null;
    const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
    return name ? { version, notes, name } : { version, notes };
  } catch {
    return null;
  }
}

function save(payload) {
  const dest = notesPath();
  if (!dest) return { ok: false };
  const version = payload && typeof payload.version === 'string' ? payload.version.trim() : '';
  const notes = payload && typeof payload.notes === 'string' ? payload.notes.trim() : '';
  if (!version || !notes) return { ok: false };
  const rec = { version, notes };
  if (payload && typeof payload.name === 'string' && payload.name.trim()) rec.name = payload.name.trim();
  const tmp = `${dest}.tmp`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(rec), 'utf8');
  fs.renameSync(tmp, dest);
  return { ok: true };
}

function clear() {
  const dest = notesPath();
  if (!dest) return { ok: true };
  try {
    fs.unlinkSync(dest);
  } catch {
    /* missing is fine */
  }
  return { ok: true };
}

module.exports = { load, save, clear, notesPath };
