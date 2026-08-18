#!/usr/bin/env node
// Download official whisper.cpp Windows x64 CPU binaries into models/bin-win-x64/.
// Never copies GGML/ONNX weights (especially q8). Best-effort: missing CLI is OK (WASM fallback).
const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const destDir = path.join(root, 'models', 'bin-win-x64');
const cli = path.join(destDir, 'whisper-cli.exe');
const VERSION = process.env.SF_WHISPER_WIN_VERSION || 'v1.9.2';
const URL =
  process.env.SF_WHISPER_WIN_URL ||
  `https://github.com/ggml-org/whisper.cpp/releases/download/${VERSION}/whisper-bin-x64.zip`;

function alreadyHaveCli() {
  try {
    return fs.existsSync(cli) && fs.statSync(cli).size > 10_000;
  } catch {
    return false;
  }
}

if (alreadyHaveCli() && !process.argv.includes('--force')) {
  console.log(`Windows whisper-cli already at ${path.relative(root, cli)}`);
  process.exit(0);
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u, hops = 0) => {
      if (hops > 8) {
        file.close();
        reject(new Error('too many redirects'));
        return;
      }
      https
        .get(u, { headers: { 'User-Agent': 'SpeakFiction-pack', Accept: '*/*' } }, (res) => {
          const loc = res.headers.location;
          if (res.statusCode >= 300 && res.statusCode < 400 && loc) {
            res.resume();
            const next = loc.startsWith('http') ? loc : new URL(loc, u).href;
            get(next, hops + 1);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            file.close();
            reject(new Error(`HTTP ${res.statusCode} for ${u}`));
            return;
          }
          res.pipe(file);
          file.on('finish', () => file.close(() => resolve()));
        })
        .on('error', (err) => {
          file.close();
          reject(err);
        });
    };
    get(url);
  });
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-whisper-win-'));
  const zip = path.join(tmp, 'whisper-bin-x64.zip');
  console.log(`Fetching ${URL}`);
  await download(URL, zip);
  const extract = path.join(tmp, 'extract');
  fs.mkdirSync(extract, { recursive: true });
  const unzip = spawnSync('unzip', ['-o', zip, '-d', extract], { encoding: 'utf8' });
  if (unzip.status !== 0) {
    throw new Error(unzip.stderr || unzip.stdout || 'unzip failed');
  }

  fs.mkdirSync(destDir, { recursive: true });
  const copied = [];
  for (const file of walk(extract)) {
    const base = path.basename(file);
    const lower = base.toLowerCase();
    if (/\.(bin|gguf|onnx|pt|pth|safetensors)$/i.test(lower)) continue;
    const keepExe = lower === 'whisper-cli.exe' || lower === 'whisper-server.exe';
    if (keepExe || /\.dll$/i.test(lower)) {
      const to = path.join(destDir, base);
      fs.copyFileSync(file, to);
      copied.push(base);
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  if (!alreadyHaveCli()) {
    throw new Error(`whisper-cli.exe missing after extract (copied: ${copied.join(', ') || 'none'})`);
  }
  console.log(`Installed Windows whisper into ${path.relative(root, destDir)} (${copied.join(', ')})`);
}

main().catch((err) => {
  console.warn(`Windows whisper.cpp binaries unavailable: ${err.message || err}`);
  console.warn('Packing will use the WASM STT fallback.');
  process.exit(0);
});
