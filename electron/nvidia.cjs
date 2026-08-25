const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/** Session flag: CUDA download or decode failed; stay on CPU until relaunch. */
let cudaBlocked = false;

function blockCuda() {
  cudaBlocked = true;
}

function cudaIsBlocked() {
  return cudaBlocked;
}

function resetCudaBlock() {
  cudaBlocked = false;
}

/**
 * nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits prints MiB.
 * A bare small number is treated as GB.
 */
function parseNvidiaSmiMemory(stdout) {
  let maxMib = 0;
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const n = Number(String(line).replace(/[^\d.]+/g, '').trim());
    if (!Number.isFinite(n) || n <= 0) continue;
    if (n > maxMib) maxMib = n;
  }
  if (maxMib <= 0) return 0;
  if (maxMib < 64) return maxMib;
  return maxMib / 1024;
}

function nvidiaSmiCandidates() {
  const extra = [];
  if (process.platform === 'win32') {
    extra.push(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'nvidia-smi.exe'));
    extra.push('C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe');
  }
  return ['nvidia-smi', ...extra.filter((file) => fs.existsSync(file))];
}

function readNvidiaSmi(execFile = execFileSync) {
  const args = ['--query-gpu=memory.total', '--format=csv,noheader,nounits'];
  const opts = {
    encoding: 'utf8',
    timeout: 2500,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  };
  let lastErr;
  for (const bin of nvidiaSmiCandidates()) {
    try {
      return execFile(bin, args, opts);
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return '';
}

/** Discrete NVIDIA VRAM in GB, or 0 if none / blocked / not Windows. */
function detectNvidiaVramGB(execFile = execFileSync) {
  if (cudaBlocked) return 0;
  if (process.platform !== 'win32') return 0;
  try {
    return parseNvidiaSmiMemory(readNvidiaSmi(execFile));
  } catch {
    return 0;
  }
}

module.exports = {
  blockCuda,
  cudaIsBlocked,
  resetCudaBlock,
  parseNvidiaSmiMemory,
  nvidiaSmiCandidates,
  detectNvidiaVramGB,
};
