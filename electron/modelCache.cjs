const fs = require('node:fs');
const path = require('node:path');
const { modelsDir, modelPath, modelReady } = require('./hardware.cjs');

const GGML_MODELS = {
  'ggml-large-v3-turbo.bin':
    'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
  'ggml-medium.en.bin': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin',
  'ggml-small.en.bin': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
};

function ensureModelsDir() {
  const dir = modelsDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'wasm-cache'), { recursive: true });
  return dir;
}

function cacheKey(url) {
  return Buffer.from(url).toString('base64url');
}

function wasmCachePath(url) {
  return path.join(modelsDir(), 'wasm-cache', cacheKey(url));
}

function cacheMatch(url) {
  const file = wasmCachePath(url);
  try {
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}

function cachePut(url, bytes) {
  ensureModelsDir();
  const file = wasmCachePath(url);
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  fs.writeFileSync(file, buf);
}

async function downloadToFile(url, dest, onProgress) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const total = Number(res.headers.get('content-length') || 0);
  const tmp = `${dest}.partial`;
  const file = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    file.write(Buffer.from(value));
    received += value.length;
    if (total && onProgress) onProgress(Math.min(99, Math.round((received / total) * 100)));
  }
  await new Promise((resolve, reject) => file.end((err) => (err ? reject(err) : resolve())));
  fs.renameSync(tmp, dest);
  onProgress?.(100);
}

async function ensureGgmlModel(filename, onProgress) {
  ensureModelsDir();
  if (modelReady(filename)) return modelPath(filename);
  const url = GGML_MODELS[filename];
  if (!url) throw new Error(`No download URL for ${filename}`);
  const dest = path.join(modelsDir(), filename);
  await downloadToFile(url, dest, onProgress);
  return dest;
}

module.exports = {
  ensureModelsDir,
  ensureGgmlModel,
  cacheMatch,
  cachePut,
  GGML_MODELS,
};
