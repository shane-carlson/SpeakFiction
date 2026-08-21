import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { systemEventsDenied } = require('../../../electron/accessibilityTrust.cjs') as {
  systemEventsDenied: (stderr?: string, message?: string) => boolean;
};

describe('systemEventsDenied', () => {
  it('recognizes Accessibility TCC denials', () => {
    expect(
      systemEventsDenied(
        'osascript is not allowed assistive access. (-25211)',
        'Command failed: osascript',
      ),
    ).toBe(true);
    expect(systemEventsDenied('not allowed assistive access', '')).toBe(true);
    expect(systemEventsDenied('', 'System Events got an error: -1719')).toBe(true);
  });

  it('does not treat unrelated osascript failures as denials', () => {
    expect(systemEventsDenied('An error of type -10827 has occurred.', 'Command failed')).toBe(
      false,
    );
    expect(systemEventsDenied('', 'ETIMEDOUT')).toBe(false);
    expect(systemEventsDenied('', '')).toBe(false);
  });
});
