import {
  cpuAfterCudaFailure,
  cpuArchFromHints,
  demoteNativeProfile,
  isSpeechModelOom,
  pickSttProfile,
  pickThreadCount,
  speechModelOomMessage,
  usesGpuRuntime,
  type HardwareInfo,
} from '../sttProfile';

const m1Max: HardwareInfo = {
  platform: 'darwin',
  arch: 'arm64',
  cores: 8,
  ramGB: 64,
  metal: true,
};

describe('pickSttProfile', () => {
  it('picks large-v3-turbo + Metal on a high-RAM Apple Silicon Mac with whisper-cli', () => {
    const p = pickSttProfile(m1Max, true);
    expect(p.runtime).toBe('whisper.cpp-metal');
    expect(p.modelId).toBe('ggml-large-v3-turbo.bin');
    expect(p.threads).toBe(8);
    expect(p.keepResident).toBe(true);
    expect(p.label).toMatch(/large-v3-turbo · Metal · 8 threads/);
  });

  it('falls back to WASM small.en on the same Mac without a native CLI', () => {
    const p = pickSttProfile(m1Max, false);
    expect(p.runtime).toBe('wasm');
    expect(p.modelId).toBe('Xenova/whisper-small.en');
    expect(p.modelId).not.toMatch(/q8/i);
  });

  it('uses medium.en on a mid native machine', () => {
    const p = pickSttProfile({ ...m1Max, ramGB: 16, cores: 8 }, true);
    expect(p.modelId).toBe('ggml-medium.en.bin');
    expect(p.runtime).toBe('whisper.cpp-metal');
  });

  it('uses tiny.en WASM on a constrained machine, never q8', () => {
    const p = pickSttProfile(
      { platform: 'darwin', arch: 'x64', cores: 2, ramGB: 4, metal: false },
      false,
    );
    expect(p.modelId).toBe('Xenova/whisper-tiny.en');
    expect(p.keepResident).toBe(false);
    expect(p.threads).toBe(1);
    expect(p.modelId).not.toMatch(/q8/i);
  });

  it('uses tiny.en CPU on 4GB Windows, never small or resident', () => {
    const p = pickSttProfile(
      { platform: 'win32', arch: 'x64', cores: 4, ramGB: 4, metal: false },
      true,
    );
    expect(p.runtime).toBe('whisper.cpp');
    expect(p.modelId).toBe('ggml-tiny.en.bin');
    expect(p.threads).toBe(1);
    expect(p.keepResident).toBe(false);
    expect(p.label).toMatch(/low memory/);
  });

  it('caps threads so weak machines are not oversubscribed', () => {
    expect(pickThreadCount({ platform: 'linux', arch: 'x64', cores: 2, ramGB: 8, metal: false })).toBe(1);
    expect(pickThreadCount(m1Max)).toBe(8);
    expect(
      pickThreadCount({ platform: 'win32', arch: 'x64', cores: 8, ramGB: 8, metal: false }),
    ).toBeLessThanOrEqual(2);
    expect(
      pickThreadCount({ platform: 'win32', arch: 'x64', cores: 16, ramGB: 32, metal: false }),
    ).toBe(8);
  });

  it('uses small.en CPU on an 8GB dual-core Intel Mac, never large or Metal', () => {
    const p = pickSttProfile(
      { platform: 'darwin', arch: 'x64', cores: 2, ramGB: 8, metal: false },
      true,
    );
    expect(p.runtime).toBe('whisper.cpp');
    expect(p.modelId).toBe('ggml-small.en.bin');
    expect(p.keepResident).toBe(false);
    expect(p.threads).toBe(1);
    expect(p.modelId).not.toContain('large');
    expect(p.label).not.toMatch(/Metal/);
  });

  it('uses medium.en CPU on a 16GB quad-core Intel Mac, never large-v3-turbo or Metal', () => {
    const p = pickSttProfile(
      { platform: 'darwin', arch: 'x64', cores: 4, ramGB: 16, metal: false },
      true,
    );
    expect(p.runtime).toBe('whisper.cpp');
    expect(p.modelId).toBe('ggml-medium.en.bin');
    expect(p.keepResident).toBe(true);
    expect(p.threads).toBeLessThanOrEqual(2);
    expect(p.modelId).not.toContain('large');
    expect(p.label).toMatch(/CPU/);
  });

  it('ignores Metal.framework on Intel even if metal is set', () => {
    const p = pickSttProfile(
      { platform: 'darwin', arch: 'x64', cores: 8, ramGB: 32, metal: true },
      true,
    );
    expect(p.runtime).toBe('whisper.cpp');
    expect(p.modelId).toBe('ggml-medium.en.bin');
    expect(p.threads).toBeLessThanOrEqual(4);
  });

  it('uses small.en CPU on 8GB Windows, never Metal or large-v3-turbo', () => {
    const p = pickSttProfile(
      { platform: 'win32', arch: 'x64', cores: 4, ramGB: 8, metal: false },
      true,
    );
    expect(p.runtime).toBe('whisper.cpp');
    expect(p.modelId).toBe('ggml-small.en.bin');
    expect(p.keepResident).toBe(false);
    expect(p.modelId).not.toContain('large');
    expect(p.label).toMatch(/CPU/);
    expect(p.label).not.toMatch(/Metal/);
  });

  it('uses medium.en CPU on 16GB Windows so a stronger PC is not stuck on small', () => {
    const p = pickSttProfile(
      { platform: 'win32', arch: 'x64', cores: 8, ramGB: 16, metal: false },
      true,
    );
    expect(p.runtime).toBe('whisper.cpp');
    expect(p.modelId).toBe('ggml-medium.en.bin');
    expect(p.keepResident).toBe(false);
    expect(p.threads).toBeGreaterThan(2);
    expect(p.threads).toBeLessThanOrEqual(6);
    expect(p.label).toMatch(/CPU/);
  });

  it('uses medium.en CPU on 24GB Windows without keeping the server resident', () => {
    const p = pickSttProfile(
      { platform: 'win32', arch: 'x64', cores: 8, ramGB: 24, metal: false },
      true,
    );
    expect(p.runtime).toBe('whisper.cpp');
    expect(p.modelId).toBe('ggml-medium.en.bin');
    expect(p.keepResident).toBe(false);
    expect(p.threads).toBeGreaterThan(2);
    expect(p.threads).toBeLessThanOrEqual(6);
  });

  it('uses large-v3-turbo CPU on 32GB Windows without pinning the server in RAM', () => {
    const p = pickSttProfile(
      { platform: 'win32', arch: 'x64', cores: 8, ramGB: 32, metal: false },
      true,
    );
    expect(p.runtime).toBe('whisper.cpp');
    expect(p.modelId).toBe('ggml-large-v3-turbo.bin');
    expect(p.keepResident).toBe(false);
    expect(p.threads).toBeGreaterThanOrEqual(4);
    expect(p.label).toMatch(/CPU/);
  });

  it('does not treat Windows ARM as Apple Silicon Metal', () => {
    const p = pickSttProfile(
      { platform: 'win32', arch: 'arm64', cores: 8, ramGB: 32, metal: true },
      true,
    );
    expect(p.runtime).toBe('whisper.cpp');
    expect(p.modelId).toBe('ggml-large-v3-turbo.bin');
    expect(p.label).not.toMatch(/Metal/);
    expect(p.keepResident).toBe(false);
  });

  it('keeps tiny.en on 4GB Windows even when NVIDIA VRAM is present', () => {
    const p = pickSttProfile(
      { platform: 'win32', arch: 'x64', cores: 8, ramGB: 4, metal: false, nvidiaVramGB: 8 },
      true,
    );
    expect(p.runtime).toBe('whisper.cpp');
    expect(p.modelId).toBe('ggml-tiny.en.bin');
    expect(p.keepResident).toBe(false);
  });

  it('uses medium.en on GPU when NVIDIA VRAM is 4GB', () => {
    const p = pickSttProfile(
      { platform: 'win32', arch: 'x64', cores: 8, ramGB: 16, metal: false, nvidiaVramGB: 4 },
      true,
    );
    expect(p.runtime).toBe('whisper.cpp-cuda');
    expect(p.modelId).toBe('ggml-medium.en.bin');
    expect(p.keepResident).toBe(false);
    expect(p.label).toMatch(/GPU/);
    expect(usesGpuRuntime(p.runtime)).toBe(true);
  });

  it('uses large-v3-turbo on GPU when NVIDIA VRAM is 8GB', () => {
    const p = pickSttProfile(
      { platform: 'win32', arch: 'x64', cores: 8, ramGB: 16, metal: false, nvidiaVramGB: 8 },
      true,
    );
    expect(p.runtime).toBe('whisper.cpp-cuda');
    expect(p.modelId).toBe('ggml-large-v3-turbo.bin');
    expect(p.keepResident).toBe(false);
    expect(p.label).toMatch(/GPU/);
  });

  it('does not use CUDA on Windows ARM even with NVIDIA VRAM reported', () => {
    const p = pickSttProfile(
      { platform: 'win32', arch: 'arm64', cores: 8, ramGB: 32, metal: false, nvidiaVramGB: 8 },
      true,
    );
    expect(p.runtime).toBe('whisper.cpp');
    expect(p.label).not.toMatch(/GPU/);
  });

  it('treats Electron process.arch as the CPU architecture, not MacIntel', () => {
    expect(
      cpuArchFromHints({
        processArch: 'arm64',
        navigatorPlatform: 'MacIntel',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      }),
    ).toBe('arm64');
  });

  it('falls back to WASM tiny.en on Windows without a native CLI, never q8', () => {
    const p = pickSttProfile(
      { platform: 'win32', arch: 'x64', cores: 8, ramGB: 16, metal: false },
      false,
    );
    expect(p.runtime).toBe('wasm');
    expect(p.modelId).toBe('Xenova/whisper-tiny.en');
    expect(p.modelId).not.toMatch(/q8/i);
  });
});

describe('demoteNativeProfile', () => {
  const win = {
    platform: 'win32',
    arch: 'x64',
    cores: 8,
    ramGB: 32,
    metal: false,
  };

  it('steps turbo to medium to small to tiny, then stops', () => {
    const turbo = pickSttProfile(win, true);
    const medium = demoteNativeProfile(turbo);
    expect(medium?.modelId).toBe('ggml-medium.en.bin');
    expect(medium?.runtime).toBe('whisper.cpp');
    expect(medium?.keepResident).toBe(false);
    const small = demoteNativeProfile(medium!);
    expect(small?.modelId).toBe('ggml-small.en.bin');
    const tiny = demoteNativeProfile(small!);
    expect(tiny?.modelId).toBe('ggml-tiny.en.bin');
    expect(demoteNativeProfile(tiny!)).toBeNull();
  });

  it('after CUDA failure uses small.en on a machine with enough RAM', () => {
    const gpu = pickSttProfile({ ...win, nvidiaVramGB: 8 }, true);
    const cpu = cpuAfterCudaFailure(gpu);
    expect(cpu.runtime).toBe('whisper.cpp');
    expect(cpu.modelId).toBe('ggml-small.en.bin');
    expect(cpu.keepResident).toBe(false);
  });
});

describe('isSpeechModelOom', () => {
  it('recognizes the ONNX session error Windows shows on Dictate', () => {
    expect(
      isSpeechModelOom("Can't create a session. ERROR CODE: 6, ERROR_MESSAGE: to:bad_alloc"),
    ).toBe(true);
    expect(isSpeechModelOom('Could not start the microphone.')).toBe(false);
    expect(speechModelOomMessage()).toMatch(/out of memory/i);
  });
});
