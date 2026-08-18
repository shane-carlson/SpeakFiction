import { resampleMono, concatFloat32, rms } from '../resample';

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
});
