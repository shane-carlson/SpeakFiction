// Electron main process. In dev it loads the Vite server; in production it
// loads the built renderer from ./dist. Kept as CommonJS (.cjs) so it runs
// without a separate compile step even though the project is ESM.
const { app, BrowserWindow, screen, shell, ipcMain, systemPreferences, session, nativeImage, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const windowState = require('./windowState.cjs');

const isDev = process.env.ELECTRON === '1' || !app.isPackaged;
app.setName('SpeakFiction');
// Must run before createWindow so the taskbar groups under this ID (and its exe icon).
if (process.platform === 'win32') {
  app.setAppUserModelId('net.speakfiction.app');
}

function packageMeta() {
  try {
    return require(path.join(__dirname, '..', 'package.json'));
  } catch {
    return { version: app.getVersion(), buildNumber: 0 };
  }
}

function isAudioPermission(permission) {
  return permission === 'media' || permission === 'audioCapture' || permission === 'microphone';
}

function pickSpellCheckerLanguages(available, locale) {
  const list = Array.isArray(available) ? available : [];
  const fallback = 'en-US';
  const normalized = String(locale || fallback).replace(/_/g, '-');
  if (list.includes(normalized)) return [normalized];
  const prefix = normalized.split('-')[0] || fallback;
  const matches = list.filter((l) => l === prefix || String(l).startsWith(`${prefix}-`));
  if (matches.includes(fallback)) return [fallback];
  if (matches.length) return [matches[0]];
  if (list.includes(fallback)) return [fallback];
  return list.slice(0, 1);
}

function setupSpellChecker() {
  const ses = session.defaultSession;
  if (typeof ses.setSpellCheckerEnabled === 'function') {
    ses.setSpellCheckerEnabled(true);
  }
  // macOS uses the OS spellchecker and ignores Hunspell language lists.
  if (process.platform === 'darwin') return;
  const available = ses.availableSpellCheckerLanguages;
  const restored = windowState.restoreSpellcheckLanguages(
    windowState.load().spellcheckLanguages,
    available,
  );
  const langs = restored.length ? restored : pickSpellCheckerLanguages(available, app.getLocale());
  if (!langs.length || typeof ses.setSpellCheckerLanguages !== 'function') return;
  try {
    ses.setSpellCheckerLanguages(langs);
    windowState.save({ spellcheckLanguages: langs });
  } catch {
    try {
      ses.setSpellCheckerLanguages(['en-US']);
      windowState.save({ spellcheckLanguages: ['en-US'] });
    } catch {
      /* Hunspell dictionary may be unavailable offline */
    }
  }
}

ipcMain.on('spellcheck:replace', (event, word) => {
  if (typeof word !== 'string' || !word) return;
  event.sender.replaceMisspelling(word);
});
ipcMain.on('spellcheck:add-word', (event, word) => {
  if (typeof word !== 'string' || !word) return;
  event.sender.session.addWordToSpellCheckerDictionary(word);
});

function setupAudioPermissions() {
  const ses = session.defaultSession;

  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(isAudioPermission(permission));
  });

  ses.setPermissionCheckHandler((_wc, permission) => isAudioPermission(permission));

  if (typeof ses.setDevicePermissionHandler === 'function') {
    ses.setDevicePermissionHandler((details) => details.deviceType === 'audio');
  }
}

function micStatus() {
  if (process.platform !== 'darwin' || typeof systemPreferences.getMediaAccessStatus !== 'function') {
    return 'granted';
  }
  return systemPreferences.getMediaAccessStatus('microphone');
}

async function requestMic() {
  if (process.platform !== 'darwin' || typeof systemPreferences.askForMediaAccess !== 'function') {
    return true;
  }
  if (micStatus() === 'granted') return true;
  return systemPreferences.askForMediaAccess('microphone');
}

function openExternal(url, fallback) {
  return shell.openExternal(url).catch(() => (fallback ? shell.openExternal(fallback) : Promise.resolve()));
}

function openSoundSettings() {
  if (process.platform === 'darwin') {
    return openExternal(
      'x-apple.systempreferences:com.apple.Sound-Settings.extension',
      'x-apple.systempreferences:com.apple.preference.sound',
    );
  }
  if (process.platform === 'win32') {
    return shell.openExternal('ms-settings:sound');
  }
  return Promise.resolve();
}

function openMicPrivacySettings() {
  if (process.platform === 'darwin') {
    return openExternal(
      'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Microphone',
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    );
  }
  if (process.platform === 'win32') {
    return shell.openExternal('ms-settings:privacy-microphone');
  }
  return Promise.resolve();
}

ipcMain.handle('audio:mic-status', () => micStatus());
ipcMain.handle('audio:request-mic', () => requestMic());
ipcMain.handle('audio:open-sound-settings', () => openSoundSettings());
ipcMain.handle('audio:open-mic-privacy', () => openMicPrivacySettings());

const sessionStore = require('./sessionStore.cjs');
const mediaStore = require('./mediaStore.cjs');
ipcMain.on('state:load', (event) => {
  event.returnValue = sessionStore.load();
});
ipcMain.handle('state:save', (_event, json) => sessionStore.save(json));
ipcMain.on('state:save-sync', (event, json) => {
  event.returnValue = sessionStore.save(json);
});
ipcMain.handle('media:save', (_event, payload) => mediaStore.save(payload));
ipcMain.handle('media:load', (_event, id) => mediaStore.load(id));
ipcMain.handle('media:remove', (_event, id) => mediaStore.remove(id));

const { logoPath, windowIconPath } = require('./paths.cjs');
const license = require('./license.cjs');
const updater = require('./updater.cjs');
const { getProfile, transcribeNative, nativeAvailable, ensureStt, cacheMatch, cachePut } = require('./whisperSidecar.cjs');

ipcMain.handle('license:status', () => license.getStatus());
ipcMain.handle('license:activate', (_event, key) => license.activate(key));
ipcMain.handle('license:buy', () => license.buy());

ipcMain.handle('stt:profile', () => getProfile());
ipcMain.handle('stt:ensure', () => ensureStt());
ipcMain.handle('stt:transcribe', async (_event, payload) => {
  const profile = getProfile();
  if (!nativeAvailable() || profile.runtime === 'wasm') {
    throw new Error('NATIVE_STT_UNAVAILABLE');
  }
  return transcribeNative(payload || {}, profile);
});
ipcMain.handle('stt:cache-match', (_event, url) => {
  const buf = cacheMatch(url);
  return buf ? new Uint8Array(buf) : null;
});
ipcMain.handle('stt:cache-put', (_event, url, bytes) => {
  cachePut(url, bytes);
});

function targetWindow() {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? undefined;
}

ipcMain.handle('files:save-text', async (_event, payload) => {
  const { canceled, filePath } = await dialog.showSaveDialog(targetWindow(), {
    defaultPath: payload?.defaultPath,
    filters: payload?.filters ?? [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { ok: false };
  await fs.writeFile(filePath, payload?.content ?? '', 'utf8');
  return { ok: true, path: filePath };
});

ipcMain.handle('files:save-bytes', async (_event, payload) => {
  const { canceled, filePath } = await dialog.showSaveDialog(targetWindow(), {
    defaultPath: payload?.defaultPath,
    filters: payload?.filters ?? [{ name: 'All files', extensions: ['*'] }],
  });
  if (canceled || !filePath) return { ok: false };
  const bytes = payload?.bytes;
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  await fs.writeFile(filePath, buf);
  return { ok: true, path: filePath };
});

ipcMain.handle('files:open-text', async (_event, payload) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(targetWindow(), {
    properties: ['openFile'],
    filters: payload?.filters ?? [{ name: 'SpeakFiction backup', extensions: ['json'] }],
  });
  if (canceled || !filePaths[0]) return { ok: false };
  const content = await fs.readFile(filePaths[0], 'utf8');
  return { ok: true, path: filePaths[0], content };
});

ipcMain.handle('files:open-bytes', async (_event, payload) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(targetWindow(), {
    properties: ['openFile'],
    filters: payload?.filters ?? [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
    ],
  });
  if (canceled || !filePaths[0]) return { ok: false };
  const buf = await fs.readFile(filePaths[0]);
  const ext = path.extname(filePaths[0]).slice(1).toLowerCase();
  const mime =
    ext === 'png'
      ? 'image/png'
      : ext === 'gif'
        ? 'image/gif'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : '';
  return { ok: true, path: filePaths[0], bytes: Uint8Array.from(buf), mime };
});

const handoff = require('./handoff.cjs');
ipcMain.handle('handoff:status', () => handoff.getStatus());
ipcMain.handle('handoff:request', () => handoff.requestAccess());
ipcMain.handle('handoff:open-privacy', () => handoff.openAccessibilitySettings());
ipcMain.handle('handoff:send', (_event, appId, payload) => handoff.sendToApp(appId, payload));
ipcMain.handle('handoff:relaunch', () => handoff.relaunchToApplyAccess());

const tickets = require('./ticket.cjs');
ipcMain.handle('help:submit-ticket', (_event, payload) => tickets.submit(payload));

function sendHelpTicket(kind) {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) win.webContents.send('help:open-ticket', kind);
}

function createWindow() {
  const iconFile = windowIconPath();
  const icon = nativeImage.createFromPath(iconFile);
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const placed = windowState.clampWindowBounds(windowState.load(), displays, primary);
  const win = new BrowserWindow({
    ...windowState.browserWindowOptions(placed),
    backgroundColor: '#0e1016',
    // Default macOS chrome: title bar, traffic lights, drag-to-move, double-click zoom.
    ...(process.platform !== 'darwin' ? { autoHideMenuBar: true } : {}),
    // Windows taskbar uses the window/exe ICO; a PNG NativeImage is ignored there.
    icon: process.platform === 'win32' ? iconFile : icon.isEmpty() ? undefined : icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  windowState.applyZoom(win, placed);
  windowState.track(win);
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });

  win.webContents.on('context-menu', (_event, params) => {
    win.webContents.send('spellcheck:context-menu', {
      misspelledWord: params.misspelledWord || '',
      dictionarySuggestions: params.dictionarySuggestions || [],
    });
  });

  // Open external links in the user's browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL('http://127.0.0.1:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  setupAudioPermissions();
  setupSpellChecker();
  const meta = packageMeta();
  app.setAboutPanelOptions({
    applicationName: 'SpeakFiction',
    applicationVersion: meta.version,
    version: meta.buildNumber ? String(meta.buildNumber) : '',
    copyright: 'Copyright © SpeakFiction',
  });
  if (process.platform === 'darwin' && app.dock) {
    const icon = nativeImage.createFromPath(logoPath());
    if (!icon.isEmpty()) app.dock.setIcon(icon);
  }
  createWindow();
  updater.setup();
  require('./appMenu.cjs').installAppMenu({
    onCheckForUpdates: () => updater.checkForUpdates({ user: true }),
    onReportProblem: () => sendHelpTicket('support'),
    onRequestFeature: () => sendHelpTicket('feature'),
  });
  app.on('browser-window-focus', () => handoff.pushStatus());
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else handoff.pushStatus();
  });
});

app.on('before-quit', () => {
  try {
    require('./whisperSidecar.cjs').stopServer();
  } catch {
    /* ignore */
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
