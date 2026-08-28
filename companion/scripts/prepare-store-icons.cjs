#!/usr/bin/env node
// App Store icons must be opaque 1024s (Apple applies the squircle). Play
// adaptive foregrounds can have transparent corners. The source mark is a
// rounded square on black; fill that canvas for iOS and punch it for Android.
const fs = require('node:fs');
const path = require('node:path');
const {
  applyRoundedIconAlpha,
  decodePng,
  encodePngRgb,
  encodePngRgba,
} = require('../../scripts/make-ico.cjs');

const root = path.join(__dirname, '..');
const src = path.join(root, 'assets', 'icon.png');
const adaptive = path.join(root, 'assets', 'adaptive-icon.png');

function lum(rgba, i) {
  return (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3;
}

function markDarkCorners(size, rgba, maxLum = 28) {
  const marked = Buffer.alloc(size * size);
  const stack = [0, size - 1, 0, size - 1];
  const ys = [0, 0, size - 1, size - 1];
  for (let s = 0; s < 4; s += 1) {
    const start = ys[s] * size + stack[s];
    if (lum(rgba, start * 4) <= maxLum) marked[start] = 1;
  }
  const q = [];
  for (let i = 0; i < marked.length; i += 1) if (marked[i]) q.push(i);
  while (q.length) {
    const idx = q.pop();
    const x = idx % size;
    const y = (idx - x) / size;
    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const nidx = ny * size + nx;
      if (marked[nidx]) continue;
      if (lum(rgba, nidx * 4) > maxLum) continue;
      marked[nidx] = 1;
      q.push(nidx);
    }
  }
  return marked;
}

function fillMarkedFromEdge(size, rgba, marked) {
  const out = Buffer.from(rgba);
  const color = Buffer.alloc(size * size * 3);
  const dist = Buffer.alloc(size * size);
  dist.fill(255);
  const q = [];
  for (let i = 0; i < marked.length; i += 1) {
    if (marked[i]) continue;
    dist[i] = 0;
    const pi = i * 4;
    color[i * 3] = out[pi];
    color[i * 3 + 1] = out[pi + 1];
    color[i * 3 + 2] = out[pi + 2];
    q.push(i);
  }
  for (let qi = 0; qi < q.length; qi += 1) {
    const idx = q[qi];
    const x = idx % size;
    const y = (idx - x) / size;
    const nd = dist[idx] + 1;
    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const nidx = ny * size + nx;
      if (!marked[nidx] || dist[nidx] <= nd) continue;
      dist[nidx] = nd;
      color[nidx * 3] = color[idx * 3];
      color[nidx * 3 + 1] = color[idx * 3 + 1];
      color[nidx * 3 + 2] = color[idx * 3 + 2];
      q.push(nidx);
    }
  }
  for (let i = 0; i < marked.length; i += 1) {
    if (!marked[i]) continue;
    const pi = i * 4;
    out[pi] = color[i * 3];
    out[pi + 1] = color[i * 3 + 1];
    out[pi + 2] = color[i * 3 + 2];
    out[pi + 3] = 255;
  }
  return out;
}

function main() {
  const decoded = decodePng(fs.readFileSync(src));
  if (decoded.width !== decoded.height) {
    console.error('Store icon must be square');
    process.exit(1);
  }
  const marked = markDarkCorners(decoded.width, decoded.rgba);
  const filled = fillMarkedFromEdge(decoded.width, decoded.rgba, marked);
  fs.writeFileSync(src, encodePngRgb(decoded.width, decoded.height, filled));
  fs.writeFileSync(
    adaptive,
    encodePngRgba(decoded.width, decoded.height, applyRoundedIconAlpha(decoded.width, filled)),
  );
  console.log(`Wrote ${src}`);
  console.log(`Wrote ${adaptive}`);
}

if (require.main === module) main();
