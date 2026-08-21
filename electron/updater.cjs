const { app, ipcMain, BrowserWindow, dialog } = require('electron');
const whatsNewStore = require('./whatsNewStore.cjs');

const CHECK_MS = 12 * 60 * 60 * 1000;
const START_DELAY_MS = 8_000;

function releaseNotesText(info) {
  const raw = info && info.releaseNotes;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item.note === 'string') return item.note.trim();
        return '';
      })
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }
  return '';
}

function emptyStatus() {
  return {
    enabled: false,
    state: 'idle',
    currentVersion: app.getVersion(),
    availableVersion: null,
    percent: null,
    error: null,
  };
}

let status = emptyStatus();
let autoUpdater = null;
let userInitiated = false;

function gatedOff() {
  if (process.env.ELECTRON === '1') return true;
  if (process.env.SPEAKFICTION_UPDATES === '0') return true;
  try {
    return !app.isPackaged;
  } catch {
    return true;
  }
}

function broadcast() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('updater:event', getStatus());
  }
}

function setStatus(patch) {
  status = {
    ...status,
    ...patch,
    currentVersion: app.getVersion(),
    enabled: !gatedOff() && Boolean(autoUpdater),
  };
  broadcast();
}

function getStatus() {
  return {
    ...status,
    currentVersion: app.getVersion(),
    enabled: !gatedOff() && Boolean(autoUpdater),
  };
}

function notifyUser(message, detail, type = 'info') {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const opts = {
    type,
    buttons: ['OK'],
    defaultId: 0,
    message,
    detail,
  };
  if (win && !win.isDestroyed()) void dialog.showMessageBox(win, opts);
  else void dialog.showMessageBox(opts);
}

async function checkForUpdates({ user } = {}) {
  userInitiated = Boolean(user);
  if (!autoUpdater) {
    if (userInitiated) {
      notifyUser(
        'Updates are not available here',
        'Packaged SpeakFiction checks GitHub Releases for updates. This copy is running unpackaged.',
      );
    }
    return getStatus();
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not check for updates.';
    if (userInitiated) setStatus({ state: 'error', error: message });
    else setStatus({ state: 'idle', error: null, availableVersion: null, percent: null });
  }
  return getStatus();
}

function setup() {
  status = emptyStatus();
  if (gatedOff()) {
    autoUpdater = null;
    return;
  }

  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch {
    autoUpdater = null;
    setStatus({ state: 'error', error: 'Updater is not included in this build.' });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => {
    setStatus({ state: 'checking', error: null });
  });
  autoUpdater.on('update-available', (info) => {
    setStatus({
      state: 'downloading',
      availableVersion: info && info.version ? String(info.version) : status.availableVersion,
      percent: 0,
      error: null,
    });
  });
  autoUpdater.on('update-not-available', () => {
    setStatus({ state: 'idle', availableVersion: null, percent: null, error: null });
    if (userInitiated) {
      notifyUser(
        'You’re up to date',
        `SpeakFiction ${app.getVersion()} is the latest version.`,
      );
    }
  });
  autoUpdater.on('download-progress', (progress) => {
    const percent = progress && typeof progress.percent === 'number' ? progress.percent : null;
    setStatus({ state: 'downloading', percent });
  });
  autoUpdater.on('update-downloaded', (info) => {
    const version = info && info.version ? String(info.version) : status.availableVersion;
    const notes = releaseNotesText(info);
    if (version && notes) {
      whatsNewStore.save({
        version,
        notes,
        name: info && info.releaseName ? String(info.releaseName) : '',
      });
    }
    setStatus({
      state: 'ready',
      availableVersion: version,
      percent: 100,
      error: null,
    });
  });
  autoUpdater.on('error', (err) => {
    const message = err && err.message ? String(err.message) : 'Could not check for updates.';
    if (userInitiated || status.state === 'downloading') {
      setStatus({ state: 'error', error: message });
      if (userInitiated) notifyUser('Could not check for updates', message, 'warning');
      return;
    }
    setStatus({ state: 'idle', error: null });
  });

  setStatus({ enabled: true, state: 'idle' });
  setTimeout(() => {
    void checkForUpdates({ user: false });
  }, START_DELAY_MS);
  setInterval(() => {
    void checkForUpdates({ user: false });
  }, CHECK_MS);
}

ipcMain.handle('updater:status', () => getStatus());
ipcMain.handle('updater:check', () => checkForUpdates({ user: true }));
ipcMain.handle('whatsNew:pending', () => whatsNewStore.load());
ipcMain.handle('whatsNew:clear', () => whatsNewStore.clear());
ipcMain.handle('updater:install', () => {
  if (!autoUpdater || status.state !== 'ready') {
    return { ok: false, error: 'No update is ready to install.' };
  }
  try {
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not install the update.';
    return { ok: false, error: message };
  }
});

module.exports = { setup, getStatus, checkForUpdates };
