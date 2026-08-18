export interface HardwareInfo {
  platform: string;
  arch: string;
  cores: number;
  ramGB: number;
  metal: boolean;
  perfCores?: number;
}

export interface SttProfile {
  hardware: HardwareInfo;
  runtime: 'whisper.cpp-metal' | 'whisper.cpp' | 'wasm';
  /** ggml filename or transformers model id */
  modelId: string;
  threads: number;
  beamSize: number;
  keepResident: boolean;
  idleUnloadMs: number;
  label: string;
}

function platformFromNavigator(): string {
  const plat = String(navigator.platform || '');
  const ua = String(navigator.userAgent || '');
  if (/mac/i.test(plat) || /Mac/i.test(ua)) return 'darwin';
  if (/win/i.test(plat) || /Windows/i.test(ua)) return 'win32';
  if (/linux/i.test(plat) || /Linux/i.test(ua)) return 'linux';
  return 'browser';
}

/** Chromium reports navigator.platform as MacIntel even on Apple Silicon. */
export function cpuArchFromHints(opts: {
  processArch?: string;
  userAgent?: string;
  navigatorPlatform?: string;
}): string {
  const proc = String(opts.processArch || '');
  if (proc === 'arm64' || proc === 'aarch64') return 'arm64';
  if (proc === 'x64' || proc === 'ia32' || proc === 'x86') return 'x64';
  const ua = opts.userAgent || '';
  const plat = opts.navigatorPlatform || '';
  if (/arm64|aarch64|Apple Silicon/i.test(ua) || /ARM/i.test(plat)) return 'arm64';
  return 'x64';
}

export function hardwareFromNavigator(): HardwareInfo {
  const cores = Math.max(1, navigator.hardwareConcurrency || 4);
  const nav = navigator as Navigator & { deviceMemory?: number };
  const ramGB = Math.max(4, nav.deviceMemory || 8);
  const platform = platformFromNavigator();
  const arch = cpuArchFromHints({
    processArch: typeof window !== 'undefined' ? window.speakfiction?.arch : undefined,
    userAgent: navigator.userAgent,
    navigatorPlatform: navigator.platform,
  });
  return {
    platform,
    arch,
    cores,
    ramGB,
    metal: platform === 'darwin' && arch === 'arm64',
  };
}

function isAppleSilicon(hw: HardwareInfo): boolean {
  return hw.platform === 'darwin' && hw.arch === 'arm64';
}

/** Decode threads: leave headroom on Intel; use more on Apple Silicon Metal. */
export function pickThreadCount(hw: HardwareInfo): number {
  const cores = Math.max(1, Math.round(hw.perfCores || hw.cores) || 1);
  if (hw.metal && isAppleSilicon(hw)) {
    return Math.max(2, Math.min(8, cores >= 8 ? 8 : Math.max(2, cores - 1)));
  }
  const half = Math.max(1, Math.floor(cores / 2));
  const spare = Math.max(1, cores - 2);
  return Math.min(4, Math.max(1, Math.min(half, spare)));
}

/**
 * Hardware-aware Whisper defaults. Never selects q8 ONNX.
 * Native whisper.cpp is preferred when the CLI is present; WASM transformers is the fallback.
 * Metal + large-v3-turbo are Apple Silicon only.
 */
export function pickSttProfile(hw: HardwareInfo, hasNativeCli: boolean): SttProfile {
  const cores = Math.max(1, hw.cores);
  const ramGB = hw.ramGB;
  const appleSilicon = isAppleSilicon(hw);
  const metal = Boolean(hw.metal) && appleSilicon;
  const threads = pickThreadCount({ ...hw, metal });
  const keepResident = appleSilicon ? ramGB >= 12 && cores >= 4 : ramGB >= 16;

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

  // WASM: never q8, never tiny. Prefer small.en on capable machines.
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
