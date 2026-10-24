#!/usr/bin/env node
// Build build/icon.icns and build/icon-mac.png from public/speakfiction-logo.png.
// The Mac plate sits on Apple's 824/1024 icon grid so the Dock and Cmd+Tab
// squircle match other apps. build/icon.png stays the full-bleed rounded mark
// (Windows and in-app fallbacks). iconutil packs the iconset; it is macOS-only.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ensureRoundedLogoPng } = require('./make-ico.cjs');
const { ensureMacIconPng, loadPunchedLogo, macPaddedPng } = require('./mac-icon.cjs');

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
  const { size, punched } = loadPunchedLogo();
  fs.rmSync(iconset, { recursive: true, force: true });
  fs.mkdirSync(iconset, { recursive: true });

  for (const [px, name] of ICNS_PNGS) {
    fs.writeFileSync(path.join(iconset, name), macPaddedPng(px, size, punched));
  }

  const png = ensureMacIconPng(undefined, { force: true });
  const iconutil = spawnSync('iconutil', ['-c', 'icns', iconset, '-o', icns], { encoding: 'utf8' });
  if (iconutil.status !== 0) {
    console.error(iconutil.stderr || 'iconutil failed (macOS only)');
    process.exit(iconutil.status ?? 1);
  }
  fs.rmSync(iconset, { recursive: true, force: true });
  fs.rmSync(path.join(root, 'build', '.ico-tmp'), { recursive: true, force: true });
  ensureRoundedLogoPng(undefined, { force: true });
  console.log(`Wrote ${icns}`);
  console.log(`Wrote ${png}`);
}

if (require.main === module) main();

module.exports = { ICNS_PNGS, main };
