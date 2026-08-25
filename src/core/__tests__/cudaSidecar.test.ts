import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const cuda = require('../../../electron/cudaSidecar.cjs') as {
  shouldKeepExtractedFile: (filename: string) => boolean;
  installExtractedCuda: (extractDir: string, destDir: string) => string[];
  isCudaCliReady: (dir?: string) => boolean;
  STAMP_VALUE: string;
};

describe('CUDA sidecar install filter', () => {
  it('keeps the CLI, server, and DLLs, and skips GGML weights', () => {
    expect(cuda.shouldKeepExtractedFile('Release/whisper-cli.exe')).toBe(true);
    expect(cuda.shouldKeepExtractedFile('whisper-server.exe')).toBe(true);
    expect(cuda.shouldKeepExtractedFile('ggml-cuda.dll')).toBe(true);
    expect(cuda.shouldKeepExtractedFile('cublas64_11.dll')).toBe(true);
    expect(cuda.shouldKeepExtractedFile('ggml-medium.en.bin')).toBe(false);
    expect(cuda.shouldKeepExtractedFile('ggml-large-v3-turbo.bin')).toBe(false);
  });
});

describe('installExtractedCuda', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    dirs.length = 0;
  });

  it('copies exe/dll files and writes a stamp, ignoring model weights', () => {
    const extract = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-cuda-extract-'));
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-cuda-dest-'));
    dirs.push(extract, dest);
    const nested = path.join(extract, 'Release');
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(nested, 'whisper-cli.exe'), Buffer.alloc(12_000, 1));
    fs.writeFileSync(path.join(nested, 'ggml-cuda.dll'), Buffer.alloc(100, 2));
    fs.writeFileSync(path.join(nested, 'ggml-tiny.en.bin'), Buffer.alloc(100, 3));

    const copied = cuda.installExtractedCuda(extract, dest);
    expect(copied).toContain('whisper-cli.exe');
    expect(copied).toContain('ggml-cuda.dll');
    expect(copied).not.toContain('ggml-tiny.en.bin');
    expect(fs.existsSync(path.join(dest, 'whisper-cli.exe'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'ggml-tiny.en.bin'))).toBe(false);
    expect(cuda.isCudaCliReady(dest)).toBe(true);
    expect(fs.readFileSync(path.join(dest, 'sf-cuda.stamp'), 'utf8').trim()).toBe(cuda.STAMP_VALUE);
  });
});
