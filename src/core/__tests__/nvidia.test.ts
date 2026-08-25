import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const nvidia = require('../../../electron/nvidia.cjs') as {
  parseNvidiaSmiMemory: (stdout: string) => number;
  blockCuda: () => void;
  resetCudaBlock: () => void;
  detectNvidiaVramGB: (execFile?: (...args: unknown[]) => string) => number;
};

describe('parseNvidiaSmiMemory', () => {
  it('reads MiB from nvidia-smi and returns GB', () => {
    expect(nvidia.parseNvidiaSmiMemory('8192\n')).toBe(8);
    expect(nvidia.parseNvidiaSmiMemory('4096\n2048\n')).toBe(4);
  });

  it('treats a small integer as GB', () => {
    expect(nvidia.parseNvidiaSmiMemory('8')).toBe(8);
  });

  it('returns 0 when nvidia-smi is empty', () => {
    expect(nvidia.parseNvidiaSmiMemory('')).toBe(0);
    expect(nvidia.parseNvidiaSmiMemory('NVIDIA-SMI has failed')).toBe(0);
  });
});

describe('detectNvidiaVramGB', () => {
  it('returns 0 after CUDA is blocked for the session', () => {
    nvidia.resetCudaBlock();
    nvidia.blockCuda();
    expect(
      nvidia.detectNvidiaVramGB(() => {
        throw new Error('should not spawn nvidia-smi');
      }),
    ).toBe(0);
    nvidia.resetCudaBlock();
  });
});
