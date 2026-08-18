import { describe, expect, it } from 'vitest';
import {
  deriveLicenseStatus,
  displayKey,
  remainingDays,
  TRIAL_MS,
  GRACE_MS,
  type LicenseRecord,
} from '../license';

const checkout = {
  gated: true,
  checkoutUrl: 'https://polar.sh/checkout/speakfiction',
  configured: true,
};

function status(record: LicenseRecord, now: number, gated = true) {
  return deriveLicenseStatus(record, now, { ...checkout, gated });
}

describe('license status', () => {
  const t0 = Date.parse('2026-08-17T12:00:00.000Z');

  it('skips the gate in development', () => {
    const s = status({}, t0, false);
    expect(s.kind).toBe('dev');
    expect(s.mayDictate).toBe(true);
    expect(s.gated).toBe(false);
  });

  it('starts a 15-day trial with 15 days remaining', () => {
    const s = status({ trialStartedAt: new Date(t0).toISOString() }, t0);
    expect(s.kind).toBe('trial');
    expect(s.mayDictate).toBe(true);
    expect(s.daysLeft).toBe(15);
  });

  it('expires when the trial window elapses', () => {
    const s = status({ trialStartedAt: new Date(t0).toISOString() }, t0 + TRIAL_MS);
    expect(s.kind).toBe('expired');
    expect(s.mayDictate).toBe(false);
    expect(s.daysLeft).toBe(0);
  });

  it('still has one day left just before the trial ends', () => {
    const s = status({ trialStartedAt: new Date(t0).toISOString() }, t0 + TRIAL_MS - 1);
    expect(s.kind).toBe('trial');
    expect(s.daysLeft).toBe(1);
  });

  it('treats a granted Polar key as licensed', () => {
    const s = status(
      {
        trialStartedAt: new Date(t0).toISOString(),
        key: 'SF-ABC123-XYZ789',
        activationId: 'act-1',
        lastValidatedStatus: 'granted',
        lastValidatedAt: new Date(t0).toISOString(),
      },
      t0,
    );
    expect(s.kind).toBe('licensed');
    expect(s.mayDictate).toBe(true);
    expect(s.displayKey).toBe('****-XYZ789');
  });

  it('blocks dictation when Polar revokes the key', () => {
    const s = status(
      {
        key: 'SF-ABC123-XYZ789',
        activationId: 'act-1',
        lastValidatedStatus: 'revoked',
      },
      t0,
    );
    expect(s.kind).toBe('expired');
    expect(s.mayDictate).toBe(false);
  });

  it('keeps dictation during Polar offline grace', () => {
    const s = status(
      {
        key: 'SF-ABC123-XYZ789',
        activationId: 'act-1',
        lastValidatedStatus: 'offline',
        lastValidatedAt: new Date(t0).toISOString(),
      },
      t0 + GRACE_MS - 1000,
    );
    expect(s.kind).toBe('grace');
    expect(s.mayDictate).toBe(true);
  });

  it('expires after Polar offline grace', () => {
    const s = status(
      {
        key: 'SF-ABC123-XYZ789',
        activationId: 'act-1',
        lastValidatedStatus: 'offline',
        lastValidatedAt: new Date(t0).toISOString(),
      },
      t0 + GRACE_MS + 1,
    );
    expect(s.kind).toBe('expired');
    expect(s.mayDictate).toBe(false);
  });

  it('masks the key and ceil-rounds remaining days', () => {
    expect(displayKey('SF-HELLO-WORLD12')).toBe('****-ORLD12');
    expect(remainingDays(t0 + 24 * 60 * 60 * 1000 - 1, t0)).toBe(1);
  });
});
