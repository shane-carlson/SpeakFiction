export interface HardwareInfo {
  platform: string;
  arch: string;
  cores: number;
  ramGB: number;
  metal: boolean;
  perfCores?: number;
  /** Discrete NVIDIA VRAM in GB. 0 / omitted = none or unknown. */
  nvidiaVramGB?: number;
}

export interface SttProfile {
  hardware: HardwareInfo;
  runtime: 'whisper.cpp-metal' | 'whisper.cpp-cuda' | 'whisper.cpp' | 'wasm';
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
    nvidiaVramGB: 0,
  };
}

function isAppleSilicon(hw: HardwareInfo): boolean {
  return hw.platform === 'darwin' && hw.arch === 'arm64';
}

export function usesGpuRuntime(runtime: string): boolean {
  return /metal|cuda/i.test(runtime);
}

/** Decode threads: leave headroom on Intel; use more on Apple Silicon Metal and high-RAM Windows. */
export function pickThreadCount(hw: HardwareInfo): number {
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

/**
 * Hardware-aware Whisper defaults. Never selects q8 ONNX.
 * Native whisper.cpp is preferred when the CLI is present; WASM transformers is the fallback.
 * Metal + large-v3-turbo are Apple Silicon only. Windows CUDA is NVIDIA + 4GB+ VRAM, x64.
 * Under 8GB RAM, tiny.en is the only size that can finish a decode without thrashing.
 */
export function pickSttProfile(hw: HardwareInfo, hasNativeCli: boolean): SttProfile {
  const cores = Math.max(1, hw.cores);
  const ramGB = hw.ramGB;
  const appleSilicon = isAppleSilicon(hw);
  const metal = Boolean(hw.metal) && appleSilicon;
  const threads = pickThreadCount({ ...hw, metal });
  const keepResident =
    appleSilicon ? ramGB >= 12 && cores >= 4 : hw.platform === 'win32' ? false : ramGB >= 16;

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
        keepResident: false,
        idleUnloadMs: 20_000,
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

  // WASM: never q8. Windows and low-RAM machines stay on tiny.en — Chromium
  // reports deviceMemory as 8GB, and whisper-small.en fp32 OOMs the session.
  if (hw.platform === 'win32' || ramGB < 8) {
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

const NATIVE_MODEL_LADDER = [
  'ggml-large-v3-turbo.bin',
  'ggml-medium.en.bin',
  'ggml-small.en.bin',
  'ggml-tiny.en.bin',
] as const;

function nativeModelShortName(modelId: string): string {
  if (modelId.includes('large')) return 'large-v3-turbo';
  if (modelId.includes('medium')) return 'whisper-medium.en';
  if (modelId.includes('small')) return 'whisper-small.en';
  return 'whisper-tiny.en';
}

/** Next-smaller native model on CPU. Used when GPU or a large model runs out of memory. */
export function demoteNativeProfile(profile: SttProfile): SttProfile | null {
  const index = (NATIVE_MODEL_LADDER as readonly string[]).indexOf(profile.modelId);
  const nextId = index === -1 ? 'ggml-tiny.en.bin' : NATIVE_MODEL_LADDER[index + 1];
  if (!nextId || nextId === profile.modelId) return null;
  const name = nativeModelShortName(nextId);
  return {
    ...profile,
    runtime: 'whisper.cpp',
    modelId: nextId,
    threads: 1,
    beamSize: 1,
    keepResident: false,
    idleUnloadMs: 8_000,
    label: `Using ${name} · CPU · low memory · 1 thread`,
  };
}

/** After CUDA fails, skip straight to a small CPU model so the same large weights are not loaded again. */
export function cpuAfterCudaFailure(profile: SttProfile): SttProfile {
  const ramGB = Number(profile.hardware?.ramGB) || 8;
  const tiny = ramGB < 8;
  return {
    ...profile,
    runtime: 'whisper.cpp',
    modelId: tiny ? 'ggml-tiny.en.bin' : 'ggml-small.en.bin',
    threads: 1,
    beamSize: 1,
    keepResident: false,
    idleUnloadMs: 8_000,
    label: tiny
      ? 'Using whisper-tiny.en · low memory · 1 thread'
      : 'Using whisper-small.en · CPU · 1 thread',
  };
}

export function isSpeechModelOom(message: string): boolean {
  return /bad_alloc|Can't create a session|out of memory/i.test(message);
}

export function speechModelOomMessage(): string {
  return 'This computer ran out of memory loading the speech model. Close other apps and press Start again.';
}
