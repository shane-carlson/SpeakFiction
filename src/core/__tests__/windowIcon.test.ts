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
  writeIcoFromRgba: (images: { size: number; rgba: Buffer }[]) => Buffer;
  listIcoSizes: (buf: Buffer) => number[];
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
  it('embeds 16 through 256 DIB entries', () => {
    const images = ico.ICO_SIZES.map((size) => ({
      size,
      rgba: Buffer.alloc(size * size * 4, 255),
    }));
    const buf = ico.writeIcoFromRgba(images);
    expect(ico.listIcoSizes(buf)).toEqual(ico.ICO_SIZES);
    expect(buf.readUInt16LE(2)).toBe(1);
    const offset = buf.readUInt32LE(6 + 12);
    expect(buf.readUInt32LE(offset)).toBe(40);
  });
});
