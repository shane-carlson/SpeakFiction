import { resampleMono, concatFloat32, pcmForNativeIpc, rms } from '../resample';

describe('resample helpers', () => {
  it('returns the same buffer when rates match', () => {
    const buf = new Float32Array([0, 0.5, 1]);
    expect(resampleMono(buf, 16000, 16000)).toBe(buf);
  });

  it('downsamples to the expected length', () => {
    const buf = new Float32Array(48000);
    buf[0] = 1;
    const out = resampleMono(buf, 48000, 16000);
    expect(out.length).toBe(16000);
    expect(out[0]).toBeCloseTo(1);
  });

  it('concatenates chunks', () => {
    const out = concatFloat32([new Float32Array([1, 2]), new Float32Array([3])]);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it('computes rms', () => {
    expect(rms(new Float32Array([0, 0, 0]))).toBe(0);
    expect(rms(new Float32Array([1, -1]))).toBeCloseTo(1);
  });

  it('copies PCM views so IPC does not clone the parent decode buffer', () => {
    const parent = new Float32Array(8);
    parent[2] = 0.5;
    parent[3] = -0.25;
    const view = parent.subarray(2, 4);
    const copy = pcmForNativeIpc(view);
    expect(copy).not.toBe(view);
    expect(copy.buffer).not.toBe(parent.buffer);
    expect(Array.from(copy)).toEqual([0.5, -0.25]);
    expect(pcmForNativeIpc(copy)).toBe(copy);
  });
});
