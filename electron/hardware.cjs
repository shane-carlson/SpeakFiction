const os = require('node:os');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { modelsDir, cliPath, serverPath, modelPath, isUsableModelFile } = require('./paths.cjs');

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
  // STT Metal is Apple Silicon only. Intel Macs and Windows use CPU whisper.
  const metal = platform === 'darwin' && arch === 'arm64';

  return {
    platform,
    arch,
    cores: logical,
    perfCores: pCores || logical,
    ramGB,
    metal,
    appleSilicon: Boolean(appleSilicon && arch === 'arm64'),
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
  return Math.min(4, Math.max(1, Math.min(half, spare)));
}

/** Keep in sync with src/core/sttProfile.ts */
function pickSttProfile(hw, hasNativeCli) {
  const cores = Math.max(1, hw.cores);
  const ramGB = hw.ramGB;
  const appleSilicon = isAppleSilicon(hw);
  const metal = Boolean(hw.metal) && appleSilicon;
  const threads = pickThreadCount({ ...hw, metal });
  const keepResident = appleSilicon ? ramGB >= 12 && cores >= 4 : ramGB >= 16;

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
  const hasNativeCli = nativeCliReady();
  const profile = pickSttProfile(hw, hasNativeCli);
  if (hasNativeCli && profile.runtime !== 'wasm' && !modelReady(profile.modelId)) {
    const intel = !isAppleSilicon(hw);
    const fallbacks = intel
      ? ['ggml-medium.en.bin', 'ggml-small.en.bin', 'ggml-tiny.en.bin']
      : ['ggml-large-v3-turbo.bin', 'ggml-medium.en.bin', 'ggml-small.en.bin', 'ggml-tiny.en.bin'];
    const allowed =
      profile.modelId === 'ggml-tiny.en.bin'
        ? ['ggml-tiny.en.bin']
        : intel && profile.modelId === 'ggml-small.en.bin'
          ? ['ggml-small.en.bin']
          : fallbacks;
    const found = allowed.find((name) => modelReady(name));
    if (found) {
      return {
        ...profile,
        modelId: found,
        label: profile.label.replace(/Using \S+/, `Using ${found.replace(/^ggml-/, '').replace(/\.bin$/, '')}`),
      };
    }
    // Keep the native profile so first-run download still happens. Dropping to
    // WASM here made packaged Apple Silicon apps stick on whisper-small.en.
    return profile;
  }
  return profile;
}

module.exports = {
  detectHardware,
  getProfile,
  pickSttProfile,
  pickThreadCount,
  modelsDir,
  cliPath,
  serverPath,
  modelPath,
  modelReady,
  nativeCliReady,
};
