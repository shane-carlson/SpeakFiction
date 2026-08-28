#!/usr/bin/env node
// Build build/icon.icns (and build/icon.png) from public/speakfiction-logo.png.
// The source PNG is RGB on black; punch rounded-rect alpha after sips so the
// Dock / Finder icon is not a black box. sips drops alpha, so we re-encode.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { decodePng, ensureRoundedLogoPng, renderPng, roundedPngFromRgba } = require('./make-ico.cjs');

const root = path.join(__dirname, '..');
const iconset = path.join(root, 'build', 'icon.iconset');
const icns = path.join(root, 'build', 'icon.icns');

const ICNS_PNGS = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png'],
];

function main() {
  fs.rmSync(iconset, { recursive: true, force: true });
  fs.mkdirSync(iconset, { recursive: true });

  for (const [px, name] of ICNS_PNGS) {
    const raw = renderPng(px);
    if (!pngBufOk(raw, px)) {
      console.error(`Could not render ${name} (${px}px)`);
      process.exit(1);
    }
    const decoded = decodePng(raw);
    fs.writeFileSync(path.join(iconset, name), roundedPngFromRgba(px, decoded.rgba));
  }

  const iconutil = spawnSync('iconutil', ['-c', 'icns', iconset, '-o', icns], { encoding: 'utf8' });
  if (iconutil.status !== 0) {
    console.error(iconutil.stderr || 'iconutil failed');
    process.exit(iconutil.status ?? 1);
  }
  fs.rmSync(iconset, { recursive: true, force: true });
  fs.rmSync(path.join(root, 'build', '.ico-tmp'), { recursive: true, force: true });
  const png = ensureRoundedLogoPng(undefined, { force: true });
  console.log(`Wrote ${icns}`);
  console.log(`Wrote ${png}`);
}

function pngBufOk(buf, size) {
  if (!buf) return false;
  try {
    const decoded = decodePng(buf);
    return decoded.width === size && decoded.height === size;
  } catch {
    return false;
  }
}

if (require.main === module) main();

module.exports = { ICNS_PNGS, main };
