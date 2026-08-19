import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const paths = require('../../../electron/paths.cjs') as {
  logoPath: () => string;
  resolveWindowIconPath: (opts?: {
    platform?: string;
    packaged?: boolean;
    resourcesPath?: string;
    root?: string;
    exists?: (file: string) => boolean;
  }) => string;
};
const ico = require('../../../scripts/make-ico.cjs') as {
  ICO_SIZES: number[];
  PNG_ICO_MIN: number;
  writeIcoFromRgba: (images: { size: number; rgba: Buffer }[]) => Buffer;
  listIcoSizes: (buf: Buffer) => number[];
  listIcoEntries: (buf: Buffer) => { size: number; png: boolean; dib: boolean }[];
  applyRoundedIconAlpha: (size: number, rgba: Buffer) => Buffer;
};

describe('window icon paths', () => {
  it('keeps the Mac dock on the PNG logo', () => {
    expect(paths.logoPath()).toMatch(/speakfiction-logo\.png$/);
  });

  it('uses a packaged .ico on Windows and PNG on Mac', () => {
    const root = '/repo';
    const resourcesPath = '/app/resources';
    expect(
      paths.resolveWindowIconPath({
        platform: 'win32',
        packaged: true,
        resourcesPath,
        root,
        exists: (file) => file === path.join(resourcesPath, 'icon.ico'),
      }),
    ).toBe(path.join(resourcesPath, 'icon.ico'));
    expect(
      paths.resolveWindowIconPath({
        platform: 'darwin',
        packaged: true,
        resourcesPath,
        root,
        exists: () => true,
      }),
    ).toBe(path.join(resourcesPath, 'speakfiction-logo.png'));
  });

  it('falls back to repo ico then PNG when unpackaged on Windows', () => {
    const root = '/repo';
    expect(
      paths.resolveWindowIconPath({
        platform: 'win32',
        packaged: false,
        resourcesPath: '',
        root,
        exists: (file) => file === path.join(root, 'build', 'icon.ico'),
      }),
    ).toBe(path.join(root, 'build', 'icon.ico'));
    expect(
      paths.resolveWindowIconPath({
        platform: 'win32',
        packaged: false,
        resourcesPath: '',
        root,
        exists: () => false,
      }),
    ).toBe(path.join(root, 'public', 'speakfiction-logo.png'));
  });
});

describe('ICO writer', () => {
  it('embeds DIB for 16–128 and PNG for 256', () => {
    const images = ico.ICO_SIZES.map((size) => ({
      size,
      rgba: Buffer.alloc(size * size * 4, 255),
    }));
    const buf = ico.writeIcoFromRgba(images);
    expect(ico.listIcoSizes(buf)).toEqual(ico.ICO_SIZES);
    expect(buf.readUInt16LE(2)).toBe(1);
    const entries = ico.listIcoEntries(buf);
    expect(entries.filter((e) => e.size < ico.PNG_ICO_MIN).every((e) => e.dib)).toBe(true);
    expect(entries.find((e) => e.size === 256)?.png).toBe(true);
    const offset = buf.readUInt32LE(6 + 12);
    expect(buf.readUInt32LE(offset)).toBe(40);
  });

  it('makes painted black corners transparent without punching the center', () => {
    const size = 32;
    const rgba = Buffer.alloc(size * size * 4, 0);
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
    rgba[0] = 80;
    rgba[1] = 140;
    rgba[2] = 240;
    const mid = ((size / 2) * size + size / 2) * 4;
    rgba[mid] = 10;
    rgba[mid + 1] = 10;
    rgba[mid + 2] = 10;
    const out = ico.applyRoundedIconAlpha(size, rgba);
    expect(out[3]).toBe(0);
    expect(out[mid + 3]).toBe(255);
  });
});
