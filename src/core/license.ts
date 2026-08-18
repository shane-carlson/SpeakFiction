/** 15 calendar-length days from first packaged launch. */
export const TRIAL_DAYS = 15;
/** Keep dictation working this long if Polar is unreachable after a successful activate. */
export const GRACE_DAYS = 7;

export const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;
export const GRACE_MS = GRACE_DAYS * 24 * 60 * 60 * 1000;

export type LicenseKind = 'dev' | 'trial' | 'expired' | 'licensed' | 'grace';
export type LicenseValidateStatus = 'granted' | 'revoked' | 'offline';

export interface LicenseRecord {
  trialStartedAt?: string;
  key?: string;
  activationId?: string;
  benefitId?: string;
  lastValidatedAt?: string;
  lastValidatedStatus?: LicenseValidateStatus;
}

export interface LicenseStatus {
  kind: LicenseKind;
  gated: boolean;
  mayDictate: boolean;
  daysLeft: number | null;
  trialEndsAt: string | null;
  checkoutUrl: string;
  canBuy: boolean;
  configured: boolean;
  displayKey: string | null;
  message: string;
}

export interface LicenseActivateResult {
  ok: boolean;
  status: LicenseStatus;
  error?: string;
  code?: string;
}

export function displayKey(key: string | undefined): string | null {
  if (!key) return null;
  const trimmed = key.trim();
  if (trimmed.length <= 8) return trimmed;
  return `****-${trimmed.slice(-6)}`;
}

export function remainingDays(endsAtMs: number, now: number): number {
  const left = endsAtMs - now;
  if (left <= 0) return 0;
  return Math.max(1, Math.ceil(left / (24 * 60 * 60 * 1000)));
}

export const UNGATED_STATUS: LicenseStatus = {
  kind: 'dev',
  gated: false,
  mayDictate: true,
  daysLeft: null,
  trialEndsAt: null,
  checkoutUrl: '',
  canBuy: false,
  configured: false,
  displayKey: null,
  message: 'Development build — license gate is off.',
};

export function deriveLicenseStatus(
  record: LicenseRecord,
  now: number,
  opts: { gated: boolean; checkoutUrl: string; configured: boolean },
): LicenseStatus {
  const checkoutUrl = opts.checkoutUrl || '';
  const canBuy = Boolean(checkoutUrl);
  const configured = Boolean(opts.configured);
  const base = {
    gated: opts.gated,
    checkoutUrl,
    canBuy,
    configured,
    displayKey: displayKey(record.key),
    trialEndsAt: null as string | null,
    daysLeft: null as number | null,
  };

  if (!opts.gated) {
    return {
      ...base,
      kind: 'dev',
      mayDictate: true,
      message: 'Development build — license gate is off.',
    };
  }

  if (record.key && (record.activationId || record.lastValidatedStatus === 'granted' || record.lastValidatedStatus === 'offline' || record.lastValidatedStatus === 'revoked')) {
    if (record.lastValidatedStatus === 'revoked') {
      return {
        ...base,
        kind: 'expired',
        mayDictate: false,
        message: 'This license is no longer valid. Buy a new key or contact support.',
      };
    }
    const lastOk = record.lastValidatedAt ? Date.parse(record.lastValidatedAt) : NaN;
    if (record.lastValidatedStatus === 'offline') {
      const graceEnds = Number.isFinite(lastOk) ? lastOk + GRACE_MS : now;
      if (now > graceEnds) {
        return {
          ...base,
          kind: 'expired',
          mayDictate: false,
          daysLeft: 0,
          message: 'Could not reach Polar to confirm this license. Connect to the internet and reopen SpeakFiction.',
        };
      }
      return {
        ...base,
        kind: 'grace',
        mayDictate: true,
        daysLeft: remainingDays(graceEnds, now),
        message: `Licensed — Polar is unreachable. ${remainingDays(graceEnds, now)} day(s) of offline grace left.`,
      };
    }
    return {
      ...base,
      kind: 'licensed',
      mayDictate: true,
      message: 'Licensed. Thank you for supporting SpeakFiction.',
    };
  }

  const started = record.trialStartedAt ? Date.parse(record.trialStartedAt) : now;
  const startMs = Number.isFinite(started) ? started : now;
  const trialEnds = startMs + TRIAL_MS;
  const trialEndsAt = new Date(trialEnds).toISOString();
  if (now < trialEnds) {
    const daysLeft = remainingDays(trialEnds, now);
    return {
      ...base,
      kind: 'trial',
      mayDictate: true,
      daysLeft,
      trialEndsAt,
      message: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your trial.`,
    };
  }
  return {
    ...base,
    kind: 'expired',
    mayDictate: false,
    daysLeft: 0,
    trialEndsAt,
    message: 'Your 15-day trial has ended. Buy a license to keep dictating.',
  };
}
