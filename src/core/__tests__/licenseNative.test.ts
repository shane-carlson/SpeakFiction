import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const polar = require('../../../electron/polar.cjs') as {
  polarHttpError: (status: number, payload: unknown) => Error & { code: string };
};
const license = require('../../../electron/license.cjs') as {
  deriveLicenseStatus: (
    record: Record<string, string | undefined>,
    now: number,
    opts: { gated: boolean; checkoutUrl: string; configured: boolean },
  ) => { kind: string; mayDictate: boolean };
  TRIAL_MS: number;
};

describe('Polar HTTP errors', () => {
  it('maps 404 and 403 to stable codes', () => {
    expect(polar.polarHttpError(404, null).code).toBe('not-found');
    expect(polar.polarHttpError(403, null).code).toBe('activation-limit');
    expect(polar.polarHttpError(422, { detail: 'bad' }).message).toContain('bad');
  });
});

describe('Electron license derive stays aligned', () => {
  it('matches the trial vs licensed split', () => {
    const now = Date.parse('2026-08-17T12:00:00.000Z');
    const opts = { gated: true, checkoutUrl: 'https://example.com', configured: true };
    const trial = license.deriveLicenseStatus({ trialStartedAt: new Date(now).toISOString() }, now, opts);
    expect(trial.kind).toBe('trial');
    expect(trial.mayDictate).toBe(true);
    const expired = license.deriveLicenseStatus(
      { trialStartedAt: new Date(now).toISOString() },
      now + license.TRIAL_MS,
      opts,
    );
    expect(expired.kind).toBe('expired');
    expect(expired.mayDictate).toBe(false);
  });
});
