#!/usr/bin/env node
// macOS Dock, toolbar, and Cmd+Tab draw the .icns pixels as-is. A plate that
// touches the square is optically larger than every other app. Apple's icon
// grid keeps the artwork in an 824×824 box centered on the 1024 canvas
// (100px margin). The system squircle then matches the neighbors.
// Windows keeps the full-bleed rounded icon (scripts/make-ico.cjs).
const fs = require('node:fs');
const path = require('node:path');
const { applyRoundedIconAlpha, decodePng, encodePngRgba } = require('./make-ico.cjs');

const root = path.join(__dirname, '..');
const src = path.join(root, 'public', 'speakfiction-logo.png');
const MAC_PNG = path.join(root, 'build', 'icon-mac.png');

/** Reference canvas from Apple's macOS app-icon template. */
const MAC_ICON_CANVAS = 1024;
/** Artwork box centered on that canvas. Margin is (1024 − 824) / 2 = 100. */
const MAC_ICON_ART = 824;

function macArtBox(canvas) {
  return Math.max(1, Math.min(canvas, Math.round((canvas * MAC_ICON_ART) / MAC_ICON_CANVAS)));
}

function macIconMargin(canvas) {
  return Math.floor((canvas - macArtBox(canvas)) / 2);
}

function scaleRgba(sw, sh, srcRgba, dw, dh) {
  if (dw === sw && dh === sh) return Buffer.from(srcRgba);
  if (dw <= sw && dh <= sh) return scaleBox(sw, sh, srcRgba, dw, dh);
  return scaleBilinear(sw, sh, srcRgba, dw, dh);
}

function scaleBox(sw, sh, srcRgba, dw, dh) {
  const dst = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y += 1) {
    const y0 = (y * sh) / dh;
    const y1 = ((y + 1) * sh) / dh;
    const iy0 = Math.floor(y0);
    const iy1 = Math.min(sh, Math.ceil(y1));
    for (let x = 0; x < dw; x += 1) {
      const x0 = (x * sw) / dw;
      const x1 = ((x + 1) * sw) / dw;
      const ix0 = Math.floor(x0);
      const ix1 = Math.min(sw, Math.ceil(x1));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let cover = 0;
      for (let iy = iy0; iy < iy1; iy += 1) {
        const wy = Math.min(iy + 1, y1) - Math.max(iy, y0);
        const row = iy * sw;
        for (let ix = ix0; ix < ix1; ix += 1) {
          const wx = Math.min(ix + 1, x1) - Math.max(ix, x0);
          const w = wx * wy;
          const i = (row + ix) * 4;
          const alpha = srcRgba[i + 3] / 255;
          r += srcRgba[i] * alpha * w;
          g += srcRgba[i + 1] * alpha * w;
          b += srcRgba[i + 2] * alpha * w;
          a += srcRgba[i + 3] * w;
          cover += w;
        }
      }
      writePremul(dst, (y * dw + x) * 4, r, g, b, a, cover);
    }
  }
  return dst;
}

function scaleBilinear(sw, sh, srcRgba, dw, dh) {
  const dst = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y += 1) {
    const fy = (y + 0.5) * (sh / dh) - 0.5;
    const y0 = Math.max(0, Math.floor(fy));
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = Math.min(1, Math.max(0, fy - y0));
    for (let x = 0; x < dw; x += 1) {
      const fx = (x + 0.5) * (sw / dw) - 0.5;
      const x0 = Math.max(0, Math.floor(fx));
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = Math.min(1, Math.max(0, fx - x0));
      const samples = [
        [(y0 * sw + x0) * 4, (1 - tx) * (1 - ty)],
        [(y0 * sw + x1) * 4, tx * (1 - ty)],
        [(y1 * sw + x0) * 4, (1 - tx) * ty],
        [(y1 * sw + x1) * 4, tx * ty],
      ];
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (const [p, w] of samples) {
        const alpha = srcRgba[p + 3] / 255;
        r += srcRgba[p] * alpha * w;
        g += srcRgba[p + 1] * alpha * w;
        b += srcRgba[p + 2] * alpha * w;
        a += srcRgba[p + 3] * w;
      }
      writePremul(dst, (y * dw + x) * 4, r, g, b, a, 1);
    }
  }
  return dst;
}

function writePremul(dst, o, r, g, b, a, cover) {
  if (cover <= 0 || a <= 0) return;
  const avgA = a / cover;
  dst[o + 3] = clampByte(avgA);
  const un = 255 / avgA;
  dst[o] = clampByte((r / cover) * un);
  dst[o + 1] = clampByte((g / cover) * un);
  dst[o + 2] = clampByte((b / cover) * un);
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function centerRgba(canvas, art, artRgba) {
  if (art > canvas) throw new Error(`Mac icon art ${art} exceeds canvas ${canvas}`);
  const out = Buffer.alloc(canvas * canvas * 4);
  const origin = Math.floor((canvas - art) / 2);
  for (let y = 0; y < art; y += 1) {
    artRgba.copy(out, ((y + origin) * canvas + origin) * 4, y * art * 4, (y + 1) * art * 4);
  }
  return out;
}

/**
 * Fit a full-bleed rounded icon onto the macOS grid.
 * `punched` is `srcSize`×`srcSize` RGBA with corners already transparent.
 * The result is `canvas`×`canvas`, with the plate in the centered art box.
 */
function macPaddedRgba(canvas, srcSize, punched) {
  const art = macArtBox(canvas);
  const scaled = scaleRgba(srcSize, srcSize, punched, art, art);
  return centerRgba(canvas, art, scaled);
}

function macPaddedPng(canvas, srcSize, punched) {
  return encodePngRgba(canvas, canvas, macPaddedRgba(canvas, srcSize, punched));
}

function loadPunchedLogo() {
  if (!fs.existsSync(src)) throw new Error(`Missing logo: ${src}`);
  const decoded = decodePng(fs.readFileSync(src));
  if (decoded.width !== decoded.height) throw new Error('Mac icon source must be square');
  return {
    size: decoded.width,
    punched: applyRoundedIconAlpha(decoded.width, decoded.rgba),
  };
}

/** Dock / window PNG. Same pixel size as the source, with the standard margin. */
function ensureMacIconPng(file = MAC_PNG, { force = false } = {}) {
  if (!fs.existsSync(src)) throw new Error(`Missing logo: ${src}`);
  if (!force && fs.existsSync(file) && fs.statSync(file).mtimeMs >= fs.statSync(src).mtimeMs) {
    return file;
  }
  const { size, punched } = loadPunchedLogo();
  const png = macPaddedPng(size, size, punched);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png);
  return file;
}

module.exports = {
  MAC_ICON_ART,
  MAC_ICON_CANVAS,
  MAC_PNG,
  centerRgba,
  ensureMacIconPng,
  loadPunchedLogo,
  macArtBox,
  macIconMargin,
  macPaddedPng,
  macPaddedRgba,
  scaleRgba,
};
