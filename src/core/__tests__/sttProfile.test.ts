import { cpuArchFromHints, pickSttProfile, pickThreadCount, type HardwareInfo } from '../sttProfile';

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

  it('uses small.en CPU on 16GB Windows so Electron still has RAM for Library', () => {
    const p = pickSttProfile(
      { platform: 'win32', arch: 'x64', cores: 8, ramGB: 16, metal: false },
      true,
    );
    expect(p.runtime).toBe('whisper.cpp');
    expect(p.modelId).toBe('ggml-small.en.bin');
    expect(p.keepResident).toBe(false);
    expect(p.threads).toBeLessThanOrEqual(2);
    expect(p.modelId).not.toContain('large');
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
    expect(p.threads).toBeLessThanOrEqual(2);
  });

  it('does not treat Windows ARM as Apple Silicon Metal', () => {
    const p = pickSttProfile(
      { platform: 'win32', arch: 'arm64', cores: 8, ramGB: 32, metal: true },
      true,
    );
    expect(p.runtime).toBe('whisper.cpp');
    expect(p.modelId).toBe('ggml-medium.en.bin');
    expect(p.label).not.toMatch(/Metal/);
    expect(p.keepResident).toBe(false);
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

  it('falls back to WASM on Windows without a native CLI, never q8', () => {
    const p = pickSttProfile(
      { platform: 'win32', arch: 'x64', cores: 8, ramGB: 16, metal: false },
      false,
    );
    expect(p.runtime).toBe('wasm');
    expect(p.modelId).toBe('Xenova/whisper-small.en');
    expect(p.modelId).not.toMatch(/q8/i);
  });
});
