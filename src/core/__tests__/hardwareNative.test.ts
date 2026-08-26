import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const hardware = require('../../../electron/hardware.cjs') as {
  detectHardware: () => {
    platform: string;
    arch: string;
    cores: number;
    ramGB: number;
    metal: boolean;
  };
  pickSttProfile: (
    hw: { platform: string; arch: string; cores: number; ramGB: number; metal: boolean; nvidiaVramGB?: number },
    hasNativeCli: boolean,
  ) => { runtime: string; modelId: string; label: string; keepResident?: boolean; threads?: number };
  nativeCliReady: () => boolean;
};
const sidecar = require('../../../electron/whisperSidecar.cjs') as {
  isEnglishOnlyModel: (modelId: string) => boolean;
  nativeArgs: (profile: { modelId: string; threads: number; beamSize: number; runtime: string }, wav: string) => string[];
};
const paths = require('../../../electron/paths.cjs') as {
  cliName: () => string;
  cliPath: () => string;
};

describe('native hardware helpers', () => {
  it('detectHardware never enables Metal off darwin', () => {
    const hw = hardware.detectHardware();
    expect(hw.ramGB).toBeGreaterThan(0.5);
    expect(hw.cores).toBeGreaterThan(0);
    if (hw.platform !== 'darwin' || hw.arch !== 'arm64') {
      expect(hw.metal).toBe(false);
    }
  });

  it('uses tiny.en on 4GB Windows so decode can finish', () => {
    const p = hardware.pickSttProfile(
      { platform: 'win32', arch: 'x64', cores: 4, ramGB: 4, metal: false },
      true,
    );
    expect(p.runtime).toBe('whisper.cpp');
    expect(p.modelId).toBe('ggml-tiny.en.bin');
    expect(p.label).toMatch(/low memory/);
  });

  it('keeps Windows STT on CPU small.en in the Electron picker', () => {
    const p = hardware.pickSttProfile(
      { platform: 'win32', arch: 'x64', cores: 4, ramGB: 8, metal: false },
      true,
    );
    expect(p.runtime).toBe('whisper.cpp');
    expect(p.modelId).toBe('ggml-small.en.bin');
    expect(p.keepResident).toBe(false);
    expect(p.label).not.toMatch(/Metal/);
  });

  it('does not keep a 16GB Windows model resident so Library can open', () => {
    const p = hardware.pickSttProfile(
      { platform: 'win32', arch: 'x64', cores: 8, ramGB: 16, metal: false },
      true,
    );
    expect(p.modelId).toBe('ggml-medium.en.bin');
    expect(p.keepResident).toBe(false);
    expect(p.runtime).toBe('whisper.cpp');
    expect(p.threads).toBeGreaterThan(2);
    expect(p.threads).toBeLessThanOrEqual(6);
  });

  it('picks CUDA large-v3-turbo in the Electron picker when NVIDIA VRAM is high', () => {
    const p = hardware.pickSttProfile(
      { platform: 'win32', arch: 'x64', cores: 8, ramGB: 32, metal: false, nvidiaVramGB: 8 },
      true,
    );
    expect(p.runtime).toBe('whisper.cpp-cuda');
    expect(p.modelId).toBe('ggml-large-v3-turbo.bin');
    expect(p.keepResident).toBe(false);
    expect(p.label).toMatch(/GPU/);
  });

  it('does not pass language or task flags to English-only models', () => {
    expect(sidecar.isEnglishOnlyModel('ggml-tiny.en.bin')).toBe(true);
    expect(sidecar.isEnglishOnlyModel('ggml-small.en.bin')).toBe(true);
    expect(sidecar.isEnglishOnlyModel('ggml-medium.en.bin')).toBe(true);
    expect(sidecar.isEnglishOnlyModel('ggml-large-v3-turbo.bin')).toBe(false);
    const args = sidecar.nativeArgs(
      { modelId: 'ggml-small.en.bin', threads: 2, beamSize: 1, runtime: 'whisper.cpp' },
      'utt.wav',
    );
    expect(args).not.toContain('-l');
    expect(args).not.toContain('--language');
    expect(args).not.toContain('--task');
    expect(args).toContain('--no-gpu');
    expect(args).toContain('--no-speech-thold');
    expect(args[args.indexOf('--no-speech-thold') + 1]).toBe('0.75');
    const multi = sidecar.nativeArgs(
      { modelId: 'ggml-large-v3-turbo.bin', threads: 4, beamSize: 5, runtime: 'whisper.cpp-metal' },
      'utt.wav',
    );
    expect(multi).toContain('-l');
    expect(multi).toContain('en');
    expect(multi).not.toContain('--no-gpu');
    const cuda = sidecar.nativeArgs(
      { modelId: 'ggml-large-v3-turbo.bin', threads: 4, beamSize: 5, runtime: 'whisper.cpp-cuda' },
      'utt.wav',
    );
    expect(cuda).not.toContain('--no-gpu');
    expect(cuda).toContain('-l');
  });

  it('resolves the CLI filename for this host', () => {
    const name = paths.cliName();
    expect(name === 'whisper-cli' || name === 'whisper-cli.exe').toBe(true);
    expect(paths.cliPath()).toContain(name);
  });
});
