// Library + UI session JSON in userData. Survives app quit and is not tied
// to Chromium localStorage origins (file:// vs localhost). Window bounds live
// beside this file in window-state.json (see electron/windowState.cjs).
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

function statePath() {
  const app = electronApp();
  if (!app) return null;
  return path.join(app.getPath('userData'), 'library-state.json');
}

function load() {
  const dest = statePath();
  if (!dest) return null;
  try {
    const text = fs.readFileSync(dest, 'utf8');
    return text && text.trim() ? text : null;
  } catch {
    return null;
  }
}

function save(json) {
  const dest = statePath();
  if (!dest) return { ok: false };
  const text = typeof json === 'string' ? json : '';
  if (!text.trim()) {
    try {
      fs.unlinkSync(dest);
    } catch {
      /* missing is fine */
    }
    return { ok: true };
  }
  const tmp = `${dest}.tmp`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, dest);
  return { ok: true };
}

module.exports = { load, save, statePath };
