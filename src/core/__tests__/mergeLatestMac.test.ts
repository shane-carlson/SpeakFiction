import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { mergeLatestMac } = require('../../../scripts/merge-latest-mac.cjs') as {
  mergeLatestMac: (dir: string) => string | null;
};

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('mergeLatestMac', () => {
  it('combines arm64 and x64 zip entries into latest-mac.yml', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-latest-mac-'));
    dirs.push(dir);
    fs.writeFileSync(
      path.join(dir, 'latest-mac-arm64.yml'),
      [
        'version: 0.1.4',
        'files:',
        '  - url: SpeakFiction-0.1.4-b9-arm64.zip',
        '    sha512: arm',
        '    size: 1',
        'path: SpeakFiction-0.1.4-b9-arm64.zip',
        'sha512: arm',
        '',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(dir, 'latest-mac-x64.yml'),
      [
        'version: 0.1.4',
        'files:',
        '  - url: SpeakFiction-0.1.4-b9-x64.zip',
        '    sha512: intel',
        '    size: 2',
        'path: SpeakFiction-0.1.4-b9-x64.zip',
        'sha512: intel',
        '',
      ].join('\n'),
    );

    const dest = mergeLatestMac(dir);
    expect(dest).toBe(path.join(dir, 'latest-mac.yml'));
    const text = fs.readFileSync(dest!, 'utf8');
    expect(text).toContain('SpeakFiction-0.1.4-b9-arm64.zip');
    expect(text).toContain('SpeakFiction-0.1.4-b9-x64.zip');
    expect(text).toMatch(/path:\s*SpeakFiction-0\.1\.4-b9-arm64\.zip/);
  });
});
