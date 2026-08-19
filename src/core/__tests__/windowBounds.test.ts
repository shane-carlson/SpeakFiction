import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const windowState = require('../../../electron/windowState.cjs') as {
  DEFAULT_WIDTH: number;
  DEFAULT_HEIGHT: number;
  MIN_WIDTH: number;
  MIN_HEIGHT: number;
  normalizeWindowState: (raw: unknown) => Record<string, unknown>;
  clampWindowBounds: (
    saved: unknown,
    displays: unknown[],
    primary: unknown,
  ) => {
    x?: number;
    y?: number;
    width: number;
    height: number;
    isMaximized?: boolean;
    isFullScreen?: boolean;
  };
  restoreSpellcheckLanguages: (saved: unknown, available: unknown) => string[];
  browserWindowOptions: (placed: { x?: number; y?: number; width: number; height: number }) => {
    x?: number;
    y?: number;
    width: number;
    height: number;
    show: boolean;
  };
};

const primary = { x: 0, y: 25, width: 1440, height: 875, workArea: { x: 0, y: 25, width: 1440, height: 875 } };
const external = {
  x: 1440,
  y: 0,
  width: 1920,
  height: 1080,
  workArea: { x: 1440, y: 0, width: 1920, height: 1080 },
};

describe('clampWindowBounds', () => {
  it('uses the default size with no position on first launch', () => {
    const placed = windowState.clampWindowBounds(null, [primary], primary);
    expect(placed).toMatchObject({
      width: windowState.DEFAULT_WIDTH,
      height: windowState.DEFAULT_HEIGHT,
    });
    expect(placed.x).toBeUndefined();
    expect(placed.y).toBeUndefined();
    expect(windowState.browserWindowOptions(placed).show).toBe(false);
    expect(windowState.browserWindowOptions(placed).x).toBeUndefined();
  });

  it('keeps bounds that still sit on a visible display', () => {
    const placed = windowState.clampWindowBounds(
      { x: 80, y: 60, width: 1100, height: 720 },
      [primary],
      primary,
    );
    expect(placed).toMatchObject({ x: 80, y: 60, width: 1100, height: 720 });
  });

  it('centers on the primary display when the saved monitor is gone', () => {
    const placed = windowState.clampWindowBounds(
      { x: 1600, y: 80, width: 1280, height: 800, isMaximized: true },
      [primary],
      primary,
    );
    expect(placed.width).toBe(1280);
    expect(placed.height).toBe(800);
    expect(placed.x).toBe(Math.round((1440 - 1280) / 2));
    expect(placed.y).toBe(25 + Math.round((875 - 800) / 2));
    expect(placed.isMaximized).toBe(true);
  });

  it('clamps a partially off-screen window onto its display', () => {
    const placed = windowState.clampWindowBounds(
      { x: 400, y: 50, width: 1280, height: 800 },
      [primary],
      primary,
    );
    expect(placed.width).toBe(1280);
    expect(placed.height).toBe(800);
    expect(placed.x).toBe(1440 - 1280);
    expect(placed.y).toBe(50);
  });

  it('shrinks a window that no longer fits the primary display', () => {
    const placed = windowState.clampWindowBounds(
      { x: -4000, y: 0, width: 2000, height: 1600 },
      [primary],
      primary,
    );
    expect(placed.width).toBe(1440);
    expect(placed.height).toBe(875);
    expect(placed.x).toBe(0);
    expect(placed.y).toBe(25);
  });

  it('restores a window that still lives on a second display', () => {
    const placed = windowState.clampWindowBounds(
      { x: 1500, y: 40, width: 1280, height: 860, isFullScreen: true },
      [primary, external],
      primary,
    );
    expect(placed).toMatchObject({ x: 1500, y: 40, width: 1280, height: 860, isFullScreen: true });
  });
});

describe('normalizeWindowState', () => {
  it('keeps additive fields and drops junk from old files', () => {
    expect(windowState.normalizeWindowState(null)).toEqual({});
    expect(
      windowState.normalizeWindowState({
        x: 10.6,
        y: 20.2,
        width: 1300.4,
        height: 900.9,
        isMaximized: 1,
        spellcheckLanguages: ['en-GB', '', 9],
      }),
    ).toEqual({
      x: 11,
      y: 20,
      width: 1300,
      height: 901,
      isMaximized: true,
      spellcheckLanguages: ['en-GB'],
    });
  });
});

describe('restoreSpellcheckLanguages', () => {
  it('keeps a user-set language only when Hunspell still has it', () => {
    expect(windowState.restoreSpellcheckLanguages(['en-GB'], ['en-US', 'en-GB'])).toEqual(['en-GB']);
    expect(windowState.restoreSpellcheckLanguages(['pt-BR'], ['en-US', 'en-GB'])).toEqual([]);
    expect(windowState.restoreSpellcheckLanguages(undefined, ['en-US'])).toEqual([]);
  });
});
