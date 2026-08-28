// Resolves on-disk locations for the packaged .app vs a git checkout.
// ExtraResources (whisper binaries, logo, and Windows tiny.en) live next to
// the asar. Larger GGML weights download into userData.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function electronApp() {
  try {
    const electron = require('electron');
    if (electron && typeof electron === 'object' && electron.app) return electron.app;
  } catch {
    /* loaded outside Electron (tests, scripts) */
  }
  return null;
}

function isPackaged() {
  return Boolean(electronApp()?.isPackaged);
}

function repoRoot() {
  return path.join(__dirname, '..');
}

function cliName() {
  return process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
}

function serverName() {
  return process.platform === 'win32' ? 'whisper-server.exe' : 'whisper-server';
}

/** whisper-cli, whisper-server, and their dylibs / DLLs */
function binDir() {
  if (isPackaged()) return path.join(process.resourcesPath, 'whisper');
  if (process.platform === 'win32') {
    const win = path.join(repoRoot(), 'models', 'bin-win-x64');
    if (fs.existsSync(path.join(win, cliName()))) return win;
  }
  return path.join(repoRoot(), 'models', 'bin');
}

function usesGpuRuntime(runtime) {
  return /metal|cuda/i.test(String(runtime || ''));
}

function usesCudaRuntime(runtime) {
  return /cuda/i.test(String(runtime || ''));
}

/** Downloaded NVIDIA CUDA whisper-cli + DLLs. Not packed into the installer. */
function cudaBinDir() {
  const app = electronApp();
  if (app?.isPackaged) return path.join(app.getPath('userData'), 'whisper-cuda');
  return path.join(repoRoot(), 'models', 'bin-win-cuda');
}

function runtimeBinDir(runtime) {
  if (usesCudaRuntime(runtime)) return cudaBinDir();
  return binDir();
}

function cliPath(runtime) {
  if (usesCudaRuntime(runtime)) return path.join(cudaBinDir(), 'whisper-cli.exe');
  return path.join(runtimeBinDir(runtime), cliName());
}

function serverPath(runtime) {
  if (usesCudaRuntime(runtime)) return path.join(cudaBinDir(), 'whisper-server.exe');
  return path.join(runtimeBinDir(runtime), serverName());
}

/** Writable cache for GGML weights and the WASM fallback */
function modelsDir() {
  const app = electronApp();
  if (app?.isPackaged) return path.join(app.getPath('userData'), 'models');
  return path.join(repoRoot(), 'models');
}

function bundledModelPath(filename) {
  if (!isPackaged()) return null;
  return path.join(process.resourcesPath, 'models', filename);
}

function isUsableModelFile(file) {
  try {
    return fs.statSync(file).size > 10_000_000;
  } catch {
    return false;
  }
}

function modelSearchDirs() {
  const dirs = [];
  const seen = new Set();
  const add = (dir) => {
    if (!dir || seen.has(dir)) return;
    seen.add(dir);
    dirs.push(dir);
  };
  add(modelsDir());
  add(path.join(repoRoot(), 'models'));
  try {
    add(path.join(os.homedir(), 'SpeakFiction', 'models'));
  } catch {
    /* ignore */
  }
  return dirs;
}

/** Prefer a user-downloaded weight; fall back to a model shipped in extraResources. */
function modelPath(filename) {
  for (const dir of modelSearchDirs()) {
    const file = path.join(dir, filename);
    if (isUsableModelFile(file)) return file;
  }
  const bundled = bundledModelPath(filename);
  if (bundled && isUsableModelFile(bundled)) return bundled;
  return path.join(modelsDir(), filename);
}

function logoPath() {
  if (isPackaged()) return path.join(process.resourcesPath, 'speakfiction-logo.png');
  return path.join(repoRoot(), 'public', 'speakfiction-logo.png');
}

/**
 * Windows taskbar / window chrome need a multi-size .ico. Mac dock stays on the PNG.
 * `exists` is injectable so tests can cover packaged NSIS layout without Electron.
 */
function resolveWindowIconPath({
  platform = process.platform,
  packaged = isPackaged(),
  resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : '',
  root = repoRoot(),
  exists = (file) => fs.existsSync(file),
} = {}) {
  if (platform === 'win32') {
    // Packaged Windows must not fall back to PNG: the taskbar ignores it and
    // shows a blank document. afterPack copies icon.ico next to the asar.
    if (packaged && resourcesPath) return path.join(resourcesPath, 'icon.ico');
    const repoIco = path.join(root, 'build', 'icon.ico');
    if (exists(repoIco)) return repoIco;
  }
  if (packaged && resourcesPath) return path.join(resourcesPath, 'speakfiction-logo.png');
  return path.join(root, 'public', 'speakfiction-logo.png');
}

function windowIconPath() {
  return resolveWindowIconPath();
}

module.exports = {
  electronApp,
  isPackaged,
  repoRoot,
  binDir,
  cudaBinDir,
  runtimeBinDir,
  cliName,
  serverName,
  cliPath,
  serverPath,
  modelsDir,
  bundledModelPath,
  modelPath,
  isUsableModelFile,
  logoPath,
  resolveWindowIconPath,
  windowIconPath,
  usesGpuRuntime,
  usesCudaRuntime,
};
