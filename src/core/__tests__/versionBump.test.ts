import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { bumpSemver } = require('../../../scripts/version.cjs') as {
  bumpSemver: (version: string, kind: string) => string;
};

describe('installer semver bump', () => {
  it('increments patch, minor, and major', () => {
    expect(bumpSemver('0.1.0', 'patch')).toBe('0.1.1');
    expect(bumpSemver('0.1.9', 'minor')).toBe('0.2.0');
    expect(bumpSemver('0.9.4', 'major')).toBe('1.0.0');
  });
});
