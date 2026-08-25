const os = require('node:os');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { modelsDir, cliPath, serverPath, modelPath, isUsableModelFile } = require('./paths.cjs');
const { detectNvidiaVramGB } = require('./nvidia.cjs');

function sysctl(key) {
  try {
    return execFileSync('/usr/sbin/sysctl', ['-n', key], {
      encoding: 'utf8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function sysctlNumber(key) {
  const n = Number(sysctl(key));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function ramGBFromElectron() {
  try {
    if (typeof process.getSystemMemoryInfo === 'function') {
      const info = process.getSystemMemoryInfo();
      if (info && info.total > 0) return info.total / (1024 * 1024);
    }
  } catch {
    /* renderer/test */
  }
  return 0;
}

function detectHardware() {
  const platform = os.platform();
  const arch = os.arch();
  let logical = os.cpus()?.length || 0;
  if (platform === 'darwin') {
    logical = sysctlNumber('hw.logicalcpu') || sysctlNumber('hw.ncpu') || logical;
  }
  if (logical < 1) logical = 4;

  const pCores = platform === 'darwin' ? sysctlNumber('hw.perflevel0.logicalcpu') : 0;

  let ramGB = os.totalmem() / (1024 * 1024 * 1024);
  if (!(ramGB > 0.5)) ramGB = ramGBFromElectron();
  if (!(ramGB > 0.5) && platform === 'darwin') {
    ramGB = sysctlNumber('hw.memsize') / (1024 * 1024 * 1024);
  }
  if (!(ramGB > 0.5)) ramGB = 8;

  const appleSilicon =
    platform === 'darwin' && (arch === 'arm64' || sysctl('hw.optional.arm64') === '1');
  // STT Metal is Apple Silicon only. Windows NVIDIA CUDA is detected separately.
  const metal = platform === 'darwin' && arch === 'arm64';
  const nvidiaVramGB = platform === 'win32' && arch !== 'arm64' ? detectNvidiaVramGB() : 0;

  return {
    platform,
    arch,
    cores: logical,
    perfCores: pCores || logical,
    ramGB,
    metal,
    appleSilicon: Boolean(appleSilicon && arch === 'arm64'),
    nvidiaVramGB,
  };
}

function isAppleSilicon(hw) {
  return hw.platform === 'darwin' && hw.arch === 'arm64';
}

function pickThreadCount(hw) {
  const cores = Math.max(1, Math.round(hw.perfCores || hw.cores) || 1);
  if (hw.metal && isAppleSilicon(hw)) {
    return Math.max(2, Math.min(8, cores >= 8 ? 8 : Math.max(2, cores - 1)));
  }
  const half = Math.max(1, Math.floor(cores / 2));
  const spare = Math.max(1, cores - 2);
  if (hw.platform === 'win32') {
    const ramGB = Number(hw.ramGB) || 0;
    if (ramGB >= 32 && cores >= 8) return Math.min(8, Math.max(4, cores - 2));
    if (ramGB >= 16 && cores >= 6) return Math.min(6, Math.max(2, Math.min(half, spare)));
    return Math.min(2, Math.max(1, Math.min(half, spare)));
  }
  return Math.min(4, Math.max(1, Math.min(half, spare)));
}

function usesGpuRuntime(runtime) {
  return /metal|cuda/i.test(String(runtime || ''));
}

/** Keep in sync with src/core/sttProfile.ts */
function pickSttProfile(hw, hasNativeCli) {
  const cores = Math.max(1, hw.cores);
  const ramGB = hw.ramGB;
  const appleSilicon = isAppleSilicon(hw);
  const metal = Boolean(hw.metal) && appleSilicon;
  const threads = pickThreadCount({ ...hw, metal });
  const keepResident =
    appleSilicon ? ramGB >= 12 && cores >= 4 : hw.platform === 'win32' ? ramGB >= 32 && cores >= 8 : ramGB >= 16;

  if (hasNativeCli && ramGB < 8) {
    return {
      hardware: hw,
      runtime: 'whisper.cpp',
      modelId: 'ggml-tiny.en.bin',
      threads: 1,
      beamSize: 1,
      keepResident: false,
      idleUnloadMs: 8_000,
      label: 'Using whisper-tiny.en · low memory · 1 thread',
    };
  }

  if (hasNativeCli && appleSilicon && ramGB >= 20 && cores >= 6) {
    return {
      hardware: hw,
      runtime: metal ? 'whisper.cpp-metal' : 'whisper.cpp',
      modelId: 'ggml-large-v3-turbo.bin',
      threads,
      beamSize: 5,
      keepResident: true,
      idleUnloadMs: 0,
      label: `Using large-v3-turbo · ${metal ? 'Metal' : 'CPU'} · ${threads} threads`,
    };
  }
  if (hasNativeCli && !appleSilicon) {
    const nvidia = Number(hw.nvidiaVramGB) || 0;
    const winCuda = hw.platform === 'win32' && hw.arch !== 'arm64' && nvidia >= 4;
    if (winCuda) {
      const turbo = nvidia >= 6 && ramGB >= 8;
      const gpuThreads = Math.min(4, Math.max(2, threads));
      return {
        hardware: hw,
        runtime: 'whisper.cpp-cuda',
        modelId: turbo ? 'ggml-large-v3-turbo.bin' : 'ggml-medium.en.bin',
        threads: gpuThreads,
        beamSize: turbo ? 5 : 3,
        keepResident: ramGB >= 16,
        idleUnloadMs: ramGB >= 16 ? 0 : 20_000,
        label: `Using ${turbo ? 'large-v3-turbo' : 'whisper-medium.en'} · GPU · ${gpuThreads} threads`,
      };
    }
    if (hw.platform === 'win32') {
      const winTurbo = ramGB >= 32 && cores >= 8;
      const winMedium = ramGB >= 16;
      const modelId = winTurbo
        ? 'ggml-large-v3-turbo.bin'
        : winMedium
          ? 'ggml-medium.en.bin'
          : 'ggml-small.en.bin';
      const name = winTurbo ? 'large-v3-turbo' : winMedium ? 'whisper-medium.en' : 'whisper-small.en';
      return {
        hardware: hw,
        runtime: 'whisper.cpp',
        modelId,
        threads,
        beamSize: winTurbo ? 5 : winMedium ? 3 : 1,
        keepResident,
        idleUnloadMs: keepResident ? 0 : 20_000,
        label: `Using ${name} · CPU · ${threads} threads`,
      };
    }
    const intelMedium = ramGB >= 16;
    return {
      hardware: hw,
      runtime: 'whisper.cpp',
      modelId: intelMedium ? 'ggml-medium.en.bin' : 'ggml-small.en.bin',
      threads,
      beamSize: intelMedium ? 3 : 1,
      keepResident,
      idleUnloadMs: keepResident ? 0 : 20_000,
      label: `Using whisper-${intelMedium ? 'medium' : 'small'}.en · CPU · ${threads} threads`,
    };
  }
  if (hasNativeCli && ramGB >= 10) {
    return {
      hardware: hw,
      runtime: metal ? 'whisper.cpp-metal' : 'whisper.cpp',
      modelId: 'ggml-medium.en.bin',
      threads,
      beamSize: ramGB >= 16 ? 5 : 3,
      keepResident,
      idleUnloadMs: keepResident ? 0 : 45_000,
      label: `Using whisper-medium.en · ${metal ? 'Metal' : 'CPU'} · ${threads} threads`,
    };
  }
  if (hasNativeCli) {
    return {
      hardware: hw,
      runtime: metal ? 'whisper.cpp-metal' : 'whisper.cpp',
      modelId: 'ggml-small.en.bin',
      threads: Math.min(threads, 4),
      beamSize: 1,
      keepResident: ramGB >= 8,
      idleUnloadMs: ramGB >= 8 ? 0 : 20_000,
      label: `Using whisper-small.en · ${metal ? 'Metal' : 'CPU'} · ${Math.min(threads, 4)} threads`,
    };
  }
  if (ramGB < 8) {
    return {
      hardware: hw,
      runtime: 'wasm',
      modelId: 'Xenova/whisper-tiny.en',
      threads: 1,
      beamSize: 1,
      keepResident: false,
      idleUnloadMs: 8_000,
      label: 'Using whisper-tiny.en · WASM · low memory · 1 thread',
    };
  }
  if (ramGB >= 8 && cores >= 4) {
    return {
      hardware: hw,
      runtime: 'wasm',
      modelId: 'Xenova/whisper-small.en',
      threads,
      beamSize: 1,
      keepResident,
      idleUnloadMs: keepResident ? 0 : 30_000,
      label: `Using whisper-small.en · WASM · ${threads} threads`,
    };
  }
  return {
    hardware: hw,
    runtime: 'wasm',
    modelId: 'Xenova/whisper-base.en',
    threads: Math.min(threads, 2),
    beamSize: 1,
    keepResident: false,
    idleUnloadMs: 15_000,
    label: `Using whisper-base.en · WASM · ${Math.min(threads, 2)} threads`,
  };
}

function modelReady(filename) {
  return isUsableModelFile(modelPath(filename));
}

function nativeCliReady() {
  try {
    return fs.existsSync(cliPath()) && fs.statSync(cliPath()).size > 10_000;
  } catch {
    return false;
  }
}

function getProfile() {
  const hw = detectHardware();
  return pickSttProfile(hw, nativeCliReady());
}

module.exports = {
  detectHardware,
  getProfile,
  pickSttProfile,
  pickThreadCount,
  usesGpuRuntime,
  modelsDir,
  cliPath,
  serverPath,
  modelPath,
  modelReady,
  nativeCliReady,
};
