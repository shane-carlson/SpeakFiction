import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_IMPORT_TOO_LARGE_MESSAGE } from '../audioImport';

const require = createRequire(import.meta.url);
const fsp = require('node:fs/promises') as typeof import('node:fs/promises');
const { readBytesIfAllowed } = require('../../../electron/openBytes.cjs') as {
  readBytesIfAllowed: (
    filePath: string,
    opts?: { maxBytes?: number; tooLargeMessage?: string },
  ) => Promise<{ ok: boolean; path?: string; bytes?: Buffer; message?: string }>;
};

describe('openBytes size gate', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns the size warning without reading an oversized audio file into memory', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-audio-'));
    dirs.push(dir);
    const file = path.join(dir, 'take.m4a');
    fs.writeFileSync(file, Buffer.alloc(64, 7));
    let read = false;
    const spy = vi.spyOn(fsp, 'readFile').mockImplementation(() => {
      read = true;
      return Promise.reject(new Error('readFile should not run'));
    });
    try {
      const res = await readBytesIfAllowed(file, {
        maxBytes: 32,
        tooLargeMessage: AUDIO_IMPORT_TOO_LARGE_MESSAGE,
      });
      expect(read).toBe(false);
      expect(res).toEqual({ ok: false, path: file, message: AUDIO_IMPORT_TOO_LARGE_MESSAGE });
    } finally {
      spy.mockRestore();
    }
  });

  it('reads a file that fits', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-audio-'));
    dirs.push(dir);
    const file = path.join(dir, 'take.wav');
    fs.writeFileSync(file, Buffer.from([1, 2, 3, 4]));
    const res = await readBytesIfAllowed(file, { maxBytes: 32, tooLargeMessage: AUDIO_IMPORT_TOO_LARGE_MESSAGE });
    expect(res.ok).toBe(true);
    expect(Buffer.from(res.bytes ?? []).equals(Buffer.from([1, 2, 3, 4]))).toBe(true);
  });
});
