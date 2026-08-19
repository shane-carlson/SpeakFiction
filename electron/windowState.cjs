// Native window bounds + spellcheck language in userData. Survives quit and
// upgrades (not inside the asar). Geometry is restored before the window shows.
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 860;
const MIN_WIDTH = 960;
const MIN_HEIGHT = 640;
const TITLE_BAR_PX = 40;
const SAVE_MS = 200;

function electronApp() {
  try {
    const electron = require('electron');
    if (electron && typeof electron === 'object' && electron.app) return electron.app;
  } catch {
    /* tests / scripts */
  }
  return null;
}

function statePath() {
  const app = electronApp();
  if (!app) return null;
  return path.join(app.getPath('userData'), 'window-state.json');
}

function workAreaOf(display) {
  if (!display || typeof display !== 'object') return null;
  const area = display.workArea && typeof display.workArea === 'object' ? display.workArea : display;
  const x = Number(area.x);
  const y = Number(area.y);
  const width = Number(area.width);
  const height = Number(area.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function overlapArea(a, b) {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
}

function titleBarVisible(bounds, area) {
  const bar = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: Math.min(TITLE_BAR_PX, bounds.height),
  };
  return overlapArea(bar, area) > 0;
}

function centerOn(area, width, height, minWidth, minHeight) {
  const w = Math.max(minWidth, Math.min(width, area.width));
  const h = Math.max(minHeight, Math.min(height, area.height));
  return {
    x: Math.round(area.x + (area.width - w) / 2),
    y: Math.round(area.y + (area.height - h) / 2),
    width: Math.round(w),
    height: Math.round(h),
  };
}

function clampInto(area, bounds, minWidth, minHeight) {
  const w = Math.max(minWidth, Math.min(bounds.width, area.width));
  const h = Math.max(minHeight, Math.min(bounds.height, area.height));
  let x = bounds.x;
  let y = bounds.y;
  if (x < area.x) x = area.x;
  if (y < area.y) y = area.y;
  if (x + w > area.x + area.width) x = area.x + area.width - w;
  if (y + h > area.y + area.height) y = area.y + area.height - h;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
}

function normalizeSpellcheckLanguages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((l) => typeof l === 'string' && l.trim()).map((l) => l.trim());
}

function restoreSpellcheckLanguages(saved, available) {
  const list = Array.isArray(available) ? available : [];
  return normalizeSpellcheckLanguages(saved).filter((l) => list.includes(l));
}

function normalizeWindowState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  const width = Number(raw.width);
  const height = Number(raw.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width >= 100 && height >= 100) {
    out.width = Math.round(width);
    out.height = Math.round(height);
  }
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    out.x = Math.round(x);
    out.y = Math.round(y);
  }
  if (raw.isMaximized) out.isMaximized = true;
  if (raw.isFullScreen) out.isFullScreen = true;
  const langs = normalizeSpellcheckLanguages(raw.spellcheckLanguages);
  if (langs.length) out.spellcheckLanguages = langs;
  return out;
}

/**
 * Restore saved bounds onto the current display layout.
 * First launch (no size) → default size, no position (OS places the window).
 * Missing display → center on primary, keep size if it fits.
 */
function clampWindowBounds(saved, displays, primary, defaults = {}) {
  const minWidth = defaults.minWidth ?? MIN_WIDTH;
  const minHeight = defaults.minHeight ?? MIN_HEIGHT;
  const defW = defaults.width ?? DEFAULT_WIDTH;
  const defH = defaults.height ?? DEFAULT_HEIGHT;
  const state = normalizeWindowState(saved);
  const primaryArea = workAreaOf(primary);
  const areas = (Array.isArray(displays) ? displays : []).map(workAreaOf).filter(Boolean);
  if (primaryArea && !areas.some((a) => a.x === primaryArea.x && a.y === primaryArea.y)) {
    areas.unshift(primaryArea);
  }

  const flags = {
    isMaximized: Boolean(state.isMaximized),
    isFullScreen: Boolean(state.isFullScreen),
  };
  if (state.spellcheckLanguages) flags.spellcheckLanguages = state.spellcheckLanguages;

  if (!state.width || !state.height) {
    return { width: defW, height: defH, ...flags };
  }

  const width = Math.max(minWidth, state.width);
  const height = Math.max(minHeight, state.height);
  if (typeof state.x !== 'number' || typeof state.y !== 'number' || !areas.length || !primaryArea) {
    return { width, height, ...flags };
  }

  const candidate = { x: state.x, y: state.y, width, height };
  let best = null;
  let bestOverlap = 0;
  for (const area of areas) {
    const o = overlapArea(candidate, area);
    if (o > bestOverlap) {
      bestOverlap = o;
      best = area;
    }
  }

  if (!best || bestOverlap <= 0 || !titleBarVisible(candidate, best)) {
    return { ...centerOn(primaryArea, width, height, minWidth, minHeight), ...flags };
  }

  return { ...clampInto(best, candidate, minWidth, minHeight), ...flags };
}

function readFile(dest) {
  try {
    const text = fs.readFileSync(dest, 'utf8');
    if (!text || !text.trim()) return {};
    return normalizeWindowState(JSON.parse(text));
  } catch {
    return {};
  }
}

function writeFile(dest, rec) {
  const tmp = `${dest}.tmp`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(rec), 'utf8');
  fs.renameSync(tmp, dest);
}

function load() {
  const dest = statePath();
  if (!dest) return {};
  return readFile(dest);
}

function save(patch) {
  const dest = statePath();
  if (!dest) return { ok: false };
  const next = normalizeWindowState({ ...load(), ...(patch && typeof patch === 'object' ? patch : {}) });
  writeFile(dest, next);
  return { ok: true };
}

function snapshot(win) {
  if (!win || typeof win.isDestroyed === 'function' && win.isDestroyed()) return null;
  const isFullScreen = Boolean(win.isFullScreen?.());
  const isMaximized = Boolean(win.isMaximized?.());
  if (win.isMinimized?.()) {
    return { isMaximized, isFullScreen };
  }
  let bounds;
  try {
    bounds =
      (isMaximized || isFullScreen) && typeof win.getNormalBounds === 'function'
        ? win.getNormalBounds()
        : win.getBounds();
  } catch {
    return null;
  }
  if (!bounds) return null;
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized,
    isFullScreen,
  };
}

function track(win) {
  let timer = null;
  const persist = (immediate) => {
    const snap = snapshot(win);
    if (!snap) return;
    const write = () => {
      timer = null;
      save(snap);
    };
    if (immediate) {
      if (timer) clearTimeout(timer);
      timer = null;
      write();
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(write, SAVE_MS);
  };

  win.on('move', () => persist(false));
  win.on('resize', () => persist(false));
  win.on('maximize', () => persist(true));
  win.on('unmaximize', () => persist(true));
  win.on('enter-full-screen', () => persist(true));
  win.on('leave-full-screen', () => persist(true));
  win.on('close', () => persist(true));
}

function browserWindowOptions(placed) {
  const opts = {
    width: placed?.width ?? DEFAULT_WIDTH,
    height: placed?.height ?? DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
  };
  if (typeof placed?.x === 'number' && typeof placed?.y === 'number') {
    opts.x = placed.x;
    opts.y = placed.y;
  }
  return opts;
}

function applyZoom(win, placed) {
  if (!win || !placed) return;
  if (placed.isFullScreen) win.setFullScreen(true);
  else if (placed.isMaximized) win.maximize();
}

module.exports = {
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  MIN_WIDTH,
  MIN_HEIGHT,
  statePath,
  normalizeWindowState,
  clampWindowBounds,
  restoreSpellcheckLanguages,
  load,
  save,
  track,
  browserWindowOptions,
  applyZoom,
};
