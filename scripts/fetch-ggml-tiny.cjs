#!/usr/bin/env node
// Download ggml-tiny.en for the Windows installer extraResources copy.
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dest = path.join(root, 'models', 'ggml-tiny.en.bin');
const URL =
  process.env.SF_TINY_MODEL_URL ||
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin';
const MIN_BYTES = 10_000_000;

function alreadyHave() {
  try {
    return fs.existsSync(dest) && fs.statSync(dest).size > MIN_BYTES;
  } catch {
    return false;
  }
}

if (alreadyHave() && !process.argv.includes('--force')) {
  console.log(`tiny.en already at ${path.relative(root, dest)}`);
  process.exit(0);
}

function download(url, file) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(file);
    const get = (u, hops = 0) => {
      if (hops > 8) {
        out.close();
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
            out.close();
            reject(new Error(`HTTP ${res.statusCode} for ${u}`));
            return;
          }
          res.pipe(out);
          out.on('finish', () => out.close(() => resolve()));
        })
        .on('error', (err) => {
          out.close();
          reject(err);
        });
    };
    get(url);
  });
}

async function main() {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.partial`;
  try {
    await download(URL, tmp);
    if (!fs.existsSync(tmp) || fs.statSync(tmp).size <= MIN_BYTES) {
      throw new Error('Downloaded tiny.en is too small');
    }
    fs.renameSync(tmp, dest);
    console.log(`Fetched ${path.relative(root, dest)} (${fs.statSync(dest).size} bytes)`);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    console.warn(`Could not fetch ggml-tiny.en: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}

void main();
