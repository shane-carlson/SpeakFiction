#!/usr/bin/env node
// Build build/icon.ico from public/speakfiction-logo.png (sips + PNG-in-ICO).
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const src = path.join(root, 'public', 'speakfiction-logo.png');
const dest = path.join(root, 'build', 'icon.ico');
const tmpDir = path.join(root, 'build', '.ico-tmp');

if (!fs.existsSync(src)) {
  console.error(`Missing logo: ${src}`);
  process.exit(1);
}

function renderPng(px) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const out = path.join(tmpDir, `icon-${px}.png`);
  const sips = spawnSync('sips', ['-z', String(px), String(px), src, '--out', out], {
    encoding: 'utf8',
  });
  if (sips.status === 0 && fs.existsSync(out)) return fs.readFileSync(out);
  if (px === 256) return fs.readFileSync(src);
  return null;
}

function writeIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  let offset = 6 + 16 * count;
  const entries = [];
  const bodies = [];
  for (const { size, buf } of images) {
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

const sizes = [16, 32, 48, 256];
const images = [];
for (const size of sizes) {
  const buf = renderPng(size);
  if (buf) images.push({ size, buf });
}
if (!images.length) {
  console.error('Could not render icon PNGs');
  process.exit(1);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, writeIco(images));
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`Wrote ${dest}`);
