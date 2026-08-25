// Download official whisper.cpp Windows CUDA (cuBLAS) binaries into userData.
// CPU whisper-cli stays in extraResources. CUDA is fetched only when NVIDIA VRAM ≥ 4GB.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { cudaBinDir } = require('./paths.cjs');
const { downloadToFile } = require('./modelCache.cjs');

const VERSION = process.env.SF_WHISPER_WIN_VERSION || 'v1.9.2';
const CUDA_PACKAGE = process.env.SF_WHISPER_CUDA_PACKAGE || 'whisper-cublas-11.8.0-bin-x64.zip';
const CUDA_URL =
  process.env.SF_WHISPER_CUDA_URL ||
  `https://github.com/ggml-org/whisper.cpp/releases/download/${VERSION}/${CUDA_PACKAGE}`;
const STAMP_NAME = 'sf-cuda.stamp';
const STAMP_VALUE = `${VERSION}:${CUDA_PACKAGE}`;

function cudaStampPath(dir = cudaBinDir()) {
  return path.join(dir, STAMP_NAME);
}

function cudaCliFile(dir = cudaBinDir()) {
  return path.join(dir, 'whisper-cli.exe');
}

function isCudaCliReady(dir = cudaBinDir()) {
  try {
    if (!fs.existsSync(cudaCliFile(dir)) || fs.statSync(cudaCliFile(dir)).size <= 10_000) return false;
    const stamp = fs.readFileSync(cudaStampPath(dir), 'utf8').trim();
    return stamp === STAMP_VALUE;
  } catch {
    return false;
  }
}

function shouldKeepExtractedFile(filename) {
  const base = path.basename(filename);
  const lower = base.toLowerCase();
  if (/\.(bin|gguf|onnx|pt|pth|safetensors)$/i.test(lower)) return false;
  if (lower === 'whisper-cli.exe' || lower === 'whisper-server.exe') return true;
  return /\.dll$/i.test(lower);
}

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

function extractZip(zip, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const tool = process.platform === 'win32' ? 'tar' : 'unzip';
  const args = process.platform === 'win32' ? ['-xf', zip, '-C', dest] : ['-o', zip, '-d', dest];
  const result = spawnSync(tool, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${tool} failed`);
  }
}

function installExtractedCuda(extractDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const copied = [];
  for (const file of walkFiles(extractDir)) {
    if (!shouldKeepExtractedFile(file)) continue;
    const to = path.join(destDir, path.basename(file));
    fs.copyFileSync(file, to);
    copied.push(path.basename(file));
  }
  if (!copied.some((name) => name.toLowerCase() === 'whisper-cli.exe')) {
    throw new Error(`whisper-cli.exe missing after CUDA extract (copied: ${copied.join(', ') || 'none'})`);
  }
  fs.writeFileSync(cudaStampPath(destDir), `${STAMP_VALUE}\n`);
  return copied;
}

async function ensureCudaCli(onProgress) {
  const dest = cudaBinDir();
  if (isCudaCliReady(dest)) return dest;
  if (process.platform !== 'win32') {
    throw new Error('CUDA whisper is Windows-only');
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-whisper-cuda-'));
  const zip = path.join(tmp, CUDA_PACKAGE);
  try {
    await downloadToFile(CUDA_URL, zip, onProgress);
    const extract = path.join(tmp, 'extract');
    extractZip(zip, extract);
    installExtractedCuda(extract, dest);
    if (!isCudaCliReady(dest)) throw new Error('CUDA whisper-cli was not usable after install');
    return dest;
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  VERSION,
  CUDA_PACKAGE,
  CUDA_URL,
  STAMP_VALUE,
  cudaStampPath,
  isCudaCliReady,
  shouldKeepExtractedFile,
  installExtractedCuda,
  ensureCudaCli,
};
