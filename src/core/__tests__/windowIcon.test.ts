import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const paths = require('../../../electron/paths.cjs') as {
  logoPath: () => string;
  resolveLogoPath: (opts?: {
    packaged?: boolean;
    resourcesPath?: string;
    root?: string;
    exists?: (file: string) => boolean;
  }) => string;
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
  decodePng: (buf: Buffer) => { width: number; height: number; rgba: Buffer };
  roundedPngFromRgba: (size: number, rgba: Buffer) => Buffer;
  ensureRoundedLogoPng: (file?: string, opts?: { force?: boolean }) => string;
};

describe('window icon paths', () => {
  it('prefers the rounded PNG for the Mac dock when it exists', () => {
    expect(
      paths.resolveLogoPath({
        packaged: false,
        root: '/repo',
        exists: (file) => file === path.join('/repo', 'build', 'icon.png'),
      }),
    ).toBe(path.join('/repo', 'build', 'icon.png'));
  });

  it('falls back to the source logo PNG', () => {
    expect(
      paths.resolveLogoPath({
        packaged: false,
        root: '/repo',
        exists: () => false,
      }),
    ).toBe(path.join('/repo', 'public', 'speakfiction-logo.png'));
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
        exists: () => false,
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

  it('uses the rounded PNG on Mac when unpackaged', () => {
    expect(
      paths.resolveWindowIconPath({
        platform: 'darwin',
        packaged: false,
        resourcesPath: '',
        root: '/repo',
        exists: (file) => file === path.join('/repo', 'build', 'icon.png'),
      }),
    ).toBe(path.join('/repo', 'build', 'icon.png'));
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
    const insideArc = (1 * size + Math.floor(size * 0.16)) * 4;
    expect(out[insideArc + 3]).toBe(0);
  });

  it('punches the real logo corners and keeps the book', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../public/speakfiction-logo.png'));
    const decoded = ico.decodePng(src);
    expect(decoded.rgba[3]).toBe(255);
    const out = ico.applyRoundedIconAlpha(decoded.width, decoded.rgba);
    expect(out[3]).toBe(0);
    const mid = ((decoded.width / 2) * decoded.width + decoded.width / 2) * 4;
    expect(out[mid + 3]).toBe(255);
    const r = decoded.width * 0.225;
    let leftoverBlack = 0;
    for (let y = 0; y < r; y += 1) {
      for (let x = 0; x < r; x += 1) {
        const i = (y * decoded.width + x) * 4;
        const lum = (out[i] + out[i + 1] + out[i + 2]) / 3;
        if (lum <= 28 && out[i + 3] > 0) leftoverBlack += 1;
      }
    }
    expect(leftoverBlack).toBe(0);
    const roundtrip = ico.decodePng(ico.roundedPngFromRgba(decoded.width, decoded.rgba));
    expect(roundtrip.rgba[3]).toBe(0);
    expect(roundtrip.rgba[mid + 3]).toBe(255);
  });

  it('writes a rounded dock PNG with transparent corners', () => {
    const dest = path.join(os.tmpdir(), `speakfiction-icon-${process.pid}.png`);
    ico.ensureRoundedLogoPng(dest, { force: true });
    const decoded = ico.decodePng(fs.readFileSync(dest));
    expect(decoded.rgba[3]).toBe(0);
    fs.unlinkSync(dest);
  });
});

describe('Windows exe icon embed', () => {
  it('flags truncated 128 and 256 PE entries from Wine rcedit', () => {
    const embed = require('../../../scripts/embed-win-icon.cjs') as {
      iconGroupGaps: (
        peIcons: { width: number; dataSize: number }[],
        icoEntries: { size: number; bytes: number }[],
      ) => { size: number; bytes: number }[];
    };
    const icoEntries = [
      { size: 16, bytes: 1128 },
      { size: 24, bytes: 2440 },
      { size: 32, bytes: 4264 },
      { size: 48, bytes: 9640 },
      { size: 64, bytes: 16936 },
      { size: 128, bytes: 67624 },
      { size: 256, bytes: 80593 },
    ];
    const truncated = [
      { width: 16, dataSize: 1128 },
      { width: 24, dataSize: 2440 },
      { width: 32, dataSize: 4264 },
      { width: 48, dataSize: 9640 },
      { width: 64, dataSize: 16936 },
      { width: 128, dataSize: 2088 },
      { width: 0, dataSize: 15057 },
    ];
    expect(embed.iconGroupGaps(truncated, icoEntries).map((g) => g.size)).toEqual([128, 256]);
    const complete = [
      { width: 16, dataSize: 1128 },
      { width: 24, dataSize: 2440 },
      { width: 32, dataSize: 4264 },
      { width: 48, dataSize: 9640 },
      { width: 64, dataSize: 16936 },
      { width: 128, dataSize: 67624 },
      { width: 0, dataSize: 80593 },
    ];
    expect(embed.iconGroupGaps(complete, icoEntries)).toEqual([]);
  });
});
