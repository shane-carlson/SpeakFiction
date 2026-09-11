import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const store = require('../../../electron/manuscriptVersions.cjs') as {
  setRoot: (dir: string | null) => void;
  save: (point: Record<string, unknown>) => { ok: boolean };
  list: (bookId: string) => { ok: boolean; points: Array<{ id: string }> };
  load: (bookId: string, id: string) => { ok: boolean; point?: { blocks: unknown[] } };
  remove: (bookId: string, id: string) => { ok: boolean };
  removeBook: (bookId: string) => { ok: boolean };
};

describe('electron manuscriptVersions store', () => {
  const dirs: string[] = [];

  afterEach(() => {
    store.setRoot(null);
    while (dirs.length) {
      const dir = dirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('saves, lists, loads, and removes a recovery point', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-versions-'));
    dirs.push(dir);
    store.setRoot(dir);
    const point = {
      id: 'msv_1',
      bookId: 'bk_ash',
      createdAt: 1,
      reason: 'dictate',
      wordCount: 3,
      blockCount: 1,
      fingerprint: 'fp',
      blocks: [{ id: 'p1', type: 'paragraph', text: 'The wind howled.' }],
    };
    expect(store.save(point).ok).toBe(true);
    expect(store.list('bk_ash').points.map((p) => p.id)).toEqual(['msv_1']);
    expect(store.load('bk_ash', 'msv_1').point?.blocks).toEqual(point.blocks);
    expect(store.remove('bk_ash', 'msv_1').ok).toBe(true);
    expect(store.list('bk_ash').points).toEqual([]);
  });
});
