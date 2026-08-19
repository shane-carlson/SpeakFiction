#!/usr/bin/env node
// Build build/icon.ico from public/speakfiction-logo.png (sips + 32-bit DIB ICO).
// Windows taskbar / rcedit need BMP-style ICO entries, not PNG-in-ICO for 16–128.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

const root = path.join(__dirname, '..');
const src = path.join(root, 'public', 'speakfiction-logo.png');
const dest = path.join(root, 'build', 'icon.ico');
const tmpDir = path.join(root, 'build', '.ico-tmp');

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Minimal 8-bit gray/RGB/RGBA PNG decoder (what sips emits). */
function decodePng(buf) {
  if (buf.length < 8 || buf.subarray(0, 8).toString('binary') !== '\x89PNG\r\n\x1a\n') {
    throw new Error('Not a PNG');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idats = [];
  while (offset + 12 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idats.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 0 && colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG type ${colorType}/${bitDepth}`);
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const inflated = zlib.inflateSync(Buffer.concat(idats));
  const stride = width * channels;
  const recon = Buffer.alloc(height * stride);
  let srcOff = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[srcOff];
    srcOff += 1;
    const row = inflated.subarray(srcOff, srcOff + stride);
    srcOff += stride;
    const out = recon.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? out[x - channels] : 0;
      const up = prev[x];
      const upLeft = x >= channels ? prev[x - channels] : 0;
      let val = row[x];
      if (filter === 1) val = (val + left) & 255;
      else if (filter === 2) val = (val + up) & 255;
      else if (filter === 3) val = (val + ((left + up) >> 1)) & 255;
      else if (filter === 4) val = (val + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`Bad PNG filter ${filter}`);
      out[x] = val;
    }
    prev = Buffer.from(out);
  }
  const rgba = Buffer.alloc(width * height * 4);
  if (channels === 4) {
    recon.copy(rgba);
  } else if (channels === 3) {
    for (let i = 0, j = 0; i < recon.length; i += 3, j += 4) {
      rgba[j] = recon[i];
      rgba[j + 1] = recon[i + 1];
      rgba[j + 2] = recon[i + 2];
      rgba[j + 3] = 255;
    }
  } else {
    for (let i = 0, j = 0; i < recon.length; i += 1, j += 4) {
      rgba[j] = recon[i];
      rgba[j + 1] = recon[i];
      rgba[j + 2] = recon[i];
      rgba[j + 3] = 255;
    }
  }
  return { width, height, rgba };
}

function dibFromRgba(size, rgba) {
  const xorRow = size * 4;
  const andRow = ((size + 31) >> 5) << 2;
  const xorSize = xorRow * size;
  const andSize = andRow * size;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(xorSize + andSize, 20);
  const xor = Buffer.alloc(xorSize);
  const and = Buffer.alloc(andSize);
  for (let y = 0; y < size; y += 1) {
    const srcY = size - 1 - y;
    for (let x = 0; x < size; x += 1) {
      const si = (srcY * size + x) * 4;
      const di = y * xorRow + x * 4;
      xor[di] = rgba[si + 2];
      xor[di + 1] = rgba[si + 1];
      xor[di + 2] = rgba[si];
      xor[di + 3] = rgba[si + 3];
      if (rgba[si + 3] < 128) {
        and[y * andRow + (x >> 3)] |= 1 << (7 - (x & 7));
      }
    }
  }
  return Buffer.concat([header, xor, and]);
}

function writeIcoFromRgba(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  let offset = 6 + 16 * count;
  const entries = [];
  const bodies = [];
  for (const { size, rgba } of images) {
    const buf = dibFromRgba(size, rgba);
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    bodies.push(buf);
    offset += buf.length;
  }
  return Buffer.concat([header, ...entries, ...bodies]);
}

function listIcoSizes(buf) {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return [];
  const count = buf.readUInt16LE(4);
  const sizes = [];
  for (let i = 0; i < count; i += 1) {
    const off = 6 + 16 * i;
    const w = buf[off];
    sizes.push(w === 0 ? 256 : w);
  }
  return sizes;
}

function renderPng(px) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const out = path.join(tmpDir, `icon-${px}.png`);
  const sips = spawnSync('sips', ['-z', String(px), String(px), src, '--out', out], {
    encoding: 'utf8',
  });
  if (sips.status === 0 && fs.existsSync(out)) return fs.readFileSync(out);
  if (px === 256 && fs.existsSync(src)) return fs.readFileSync(src);
  return null;
}

function main() {
  if (!fs.existsSync(src)) {
    console.error(`Missing logo: ${src}`);
    process.exit(1);
  }

  const images = [];
  for (const size of ICO_SIZES) {
    const png = renderPng(size);
    if (!png) continue;
    const decoded = decodePng(png);
    if (decoded.width !== size || decoded.height !== size) continue;
    images.push({ size, rgba: decoded.rgba });
  }
  if (!images.length) {
    console.error('Could not render icon PNGs');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, writeIcoFromRgba(images));
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`Wrote ${dest} (${images.map((i) => i.size).join(', ')})`);
}

if (require.main === module) main();

module.exports = {
  ICO_SIZES,
  decodePng,
  dibFromRgba,
  writeIcoFromRgba,
  listIcoSizes,
  main,
};
