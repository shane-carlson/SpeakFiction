const { app, clipboard, shell, systemPreferences, BrowserWindow } = require('electron');
const { execFile, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');

const { systemEventsDenied } = require('./accessibilityTrust.cjs');

const execFileAsync = promisify(execFile);

/** Once Accessibility works for this process, keep treating it as granted. */
let knownTrusted = false;
/** At most one live (prompting) AX check per process, besides Enable. */
let liveCheckUsed = false;

const TARGETS = [
  {
    id: 'scrivener',
    name: 'Scrivener',
    appNames: ['Scrivener'],
    processNames: ['Scrivener'],
    bundleIds: ['com.literatureandlatte.scrivener3', 'com.literatureandlatte.scrivener'],
  },
  {
    id: 'word',
    name: 'Microsoft Word',
    appNames: ['Microsoft Word'],
    processNames: ['Microsoft Word', 'Word'],
    bundleIds: ['com.microsoft.Word'],
  },
  {
    id: 'libreoffice',
    name: 'LibreOffice',
    appNames: ['LibreOffice'],
    processNames: ['soffice', 'soffice.bin', 'LibreOffice'],
    bundleIds: ['org.libreoffice.script', 'org.libreoffice.LibreOffice'],
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDarwin() {
  return process.platform === 'darwin';
}

function accessibilityClientName() {
  try {
    if (app && app.isPackaged === false) return 'Electron';
  } catch {
    /* app not ready */
  }
  return 'SpeakFiction';
}

function appBundlePath() {
  const exe = String(process.execPath || '');
  const idx = exe.lastIndexOf('.app');
  if (idx > 0) return exe.slice(0, idx + 4);
  return exe;
}

function accessRequestFlagPath() {
  return path.join(app.getPath('userData'), 'accessibility-requested');
}

function rememberAccessRequest() {
  try {
    fs.writeFileSync(accessRequestFlagPath(), '1');
  } catch {
    /* ignore */
  }
}

function hadAccessRequest() {
  try {
    return fs.existsSync(accessRequestFlagPath());
  } catch {
    return false;
  }
}

function readElectronTrust(prompt) {
  if (typeof systemPreferences.isTrustedAccessibilityClient !== 'function') return false;
  return Boolean(systemPreferences.isTrustedAccessibilityClient(Boolean(prompt)));
}

function isTrusted() {
  if (!isDarwin()) return false;
  if (knownTrusted) return true;
  if (readElectronTrust(false)) {
    knownTrusted = true;
    return true;
  }
  // Silent false often stays false after a grant. One live check per process
  // if the user already clicked Enable — Apple does not re-prompt when this
  // process is already allowed.
  if (!liveCheckUsed && hadAccessRequest()) {
    liveCheckUsed = true;
    if (readElectronTrust(true)) {
      knownTrusted = true;
      return true;
    }
  }
  return false;
}

function markTrusted() {
  knownTrusted = true;
}

function openAccessibilitySettings() {
  if (!isDarwin()) return Promise.resolve();
  return shell
    .openExternal('x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility')
    .catch(() =>
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'),
    );
}

function findAppPath(target) {
  const homes = [ '/Applications', path.join(os.homedir(), 'Applications') ];
  for (const name of target.appNames) {
    for (const root of homes) {
      const candidate = path.join(root, `${name}.app`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  for (const bundleId of target.bundleIds) {
    try {
      const stdout = String(execFileSync('/usr/bin/mdfind', [`kMDItemCFBundleIdentifier == '${bundleId}'`], {
        encoding: 'utf8',
        timeout: 2500,
        stdio: ['ignore', 'pipe', 'ignore'],
      }));
      const hit = String(stdout)
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.endsWith('.app') && fs.existsSync(l));
      if (hit) return hit;
    } catch {
      /* Spotlight unavailable */
    }
  }
  return null;
}

function isRunning(target) {
  for (const name of target.processNames) {
    try {
      execFileSync('/usr/bin/pgrep', ['-x', name], {
        stdio: 'ignore',
        timeout: 1500,
      });
      return true;
    } catch {
      /* not this name */
    }
  }
  const appPath = findAppPath(target);
  if (!appPath) return false;
  try {
    execFileSync('/usr/bin/pgrep', ['-f', appPath], {
      stdio: 'ignore',
      timeout: 1500,
    });
    return true;
  } catch {
    return false;
  }
}

function emptyStatus(trusted) {
  const targets = TARGETS.map((t) => ({
    id: t.id,
    name: t.name,
    installed: false,
    running: false,
  }));
  return {
    available: false,
    trusted: Boolean(trusted),
    clientName: accessibilityClientName(),
    appPath: '',
    targets,
  };
}

function getStatus() {
  if (!isDarwin()) return emptyStatus(false);
  return {
    available: true,
    trusted: isTrusted(),
    clientName: accessibilityClientName(),
    appPath: appBundlePath(),
    targets: TARGETS.map((t) => ({
      id: t.id,
      name: t.name,
      installed: Boolean(findAppPath(t)),
      running: isRunning(t),
    })),
  };
}

function pushStatus() {
  const status = getStatus();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('handoff:status', status);
  }
  return status;
}

async function requestAccess() {
  rememberAccessRequest();
  liveCheckUsed = true;
  // Honor the live result. A following silent check often stays false even
  // when this process is already allowed.
  if (readElectronTrust(true) || readElectronTrust(false)) {
    knownTrusted = true;
  }
  return getStatus();
}

function relaunchToApplyAccess() {
  app.relaunch();
  app.exit(0);
}

function snapshotClipboard() {
  return {
    text: clipboard.readText(),
    html: clipboard.readHTML(),
    rtf: clipboard.readRTF(),
  };
}

function restoreClipboard(snap) {
  try {
    const payload = {};
    if (snap.text) payload.text = snap.text;
    if (snap.html) payload.html = snap.html;
    if (snap.rtf) payload.rtf = snap.rtf;
    if (Object.keys(payload).length) clipboard.write(payload);
  } catch {
    /* ignore */
  }
}

async function pasteViaSystemEvents() {
  await execFileAsync(
    '/usr/bin/osascript',
    [
      '-e',
      'tell application "System Events" to keystroke "v" using command down',
    ],
    { timeout: 12_000 },
  );
}

async function sendToApp(appId, payload) {
  if (!isDarwin()) return { ok: false, reason: 'unsupported' };
  const target = TARGETS.find((t) => t.id === appId);
  if (!target) return { ok: false, reason: 'unknown-app' };

  const text = String(payload?.text ?? '').trim();
  const rtf = String(payload?.rtf ?? '');
  if (!text) return { ok: false, reason: 'empty' };

  const appPath = findAppPath(target);
  if (!appPath) return { ok: false, reason: 'not-installed', status: getStatus() };

  const wasRunning = isRunning(target);
  const previous = snapshotClipboard();
  clipboard.write({
    text,
    ...(rtf ? { rtf } : {}),
  });

  try {
    app.hide();
    await execFileAsync('/usr/bin/open', [appPath], { timeout: 8000 });
    await sleep(wasRunning ? 450 : 2200);
    await pasteViaSystemEvents();
    markTrusted();
    setTimeout(() => restoreClipboard(previous), 1200);
    return { ok: true, app: target.id, launched: !wasRunning, status: getStatus() };
  } catch (err) {
    restoreClipboard(previous);
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
    }
    if (systemEventsDenied(err?.stderr, err?.message)) {
      return { ok: false, reason: 'no-accessibility', status: getStatus() };
    }
    return {
      ok: false,
      reason: 'paste-failed',
      detail: err?.message || String(err),
      status: getStatus(),
    };
  }
}

module.exports = {
  getStatus,
  requestAccess,
  openAccessibilitySettings,
  sendToApp,
  pushStatus,
  relaunchToApplyAccess,
};
