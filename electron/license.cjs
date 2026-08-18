// Trial clock + Polar activation. Packaged builds are gated; unpackaged /
// ELECTRON=1 skip the gate so development is unblocked.
// Override: SPEAKFICTION_LICENSE_GATE=1 forces the gate even in dev.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const polar = require('./polar.cjs');
const config = require('./polarConfig.cjs');

function electronApp() {
  try {
    const electron = require('electron');
    if (electron && typeof electron === 'object' && electron.app) return electron.app;
  } catch {
    /* tests / scripts */
  }
  return null;
}

const TRIAL_DAYS = 15;
const GRACE_DAYS = 7;
const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;
const GRACE_MS = GRACE_DAYS * 24 * 60 * 60 * 1000;

function nowMs() {
  return Date.now();
}

function isGated() {
  if (process.env.SPEAKFICTION_LICENSE_GATE === '1') return true;
  if (process.env.SPEAKFICTION_LICENSE_GATE === '0') return false;
  try {
    if (process.env.ELECTRON === '1') return false;
    return Boolean(electronApp()?.isPackaged);
  } catch {
    return false;
  }
}

function licensePath() {
  const app = electronApp();
  if (!app) return path.join(os.tmpdir(), 'speakfiction-license-test.json');
  return path.join(app.getPath('userData'), 'license.json');
}

function displayKey(key) {
  if (!key) return null;
  const trimmed = String(key).trim();
  if (trimmed.length <= 8) return trimmed;
  return `****-${trimmed.slice(-6)}`;
}

function remainingDays(endsAtMs, now) {
  const left = endsAtMs - now;
  if (left <= 0) return 0;
  return Math.max(1, Math.ceil(left / (24 * 60 * 60 * 1000)));
}

/** Keep in sync with src/core/license.ts deriveLicenseStatus. */
function deriveLicenseStatus(record, now, opts) {
  const checkoutUrl = opts.checkoutUrl || '';
  const canBuy = Boolean(checkoutUrl);
  const configured = Boolean(opts.configured);
  const base = {
    gated: opts.gated,
    checkoutUrl,
    canBuy,
    configured,
    displayKey: displayKey(record.key),
    trialEndsAt: null,
    daysLeft: null,
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
          message:
            'Could not reach Polar to confirm this license. Connect to the internet and reopen SpeakFiction.',
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

function emptyRecord() {
  return {};
}

function readRecord() {
  try {
    const raw = fs.readFileSync(licensePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : emptyRecord();
  } catch {
    return emptyRecord();
  }
}

function writeRecord(record) {
  const dir = path.dirname(licensePath());
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${licensePath()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, licensePath());
}

function ensureTrialStarted(record, now) {
  if (record.trialStartedAt) return record;
  const next = { ...record, trialStartedAt: new Date(now).toISOString() };
  writeRecord(next);
  return next;
}

function statusOpts() {
  return {
    gated: isGated(),
    checkoutUrl: config.checkoutUrl,
    configured: config.isConfigured(),
  };
}

function statusFrom(record, now = nowMs()) {
  return deriveLicenseStatus(record, now, statusOpts());
}

let validatedThisLaunch = false;

async function refreshValidation(record) {
  if (!isGated()) return record;
  if (!record.key) return record;
  if (record.lastValidatedStatus === 'revoked') return record;
  if (validatedThisLaunch) return record;
  try {
    const result = await polar.validate(record.key, record.activationId);
    validatedThisLaunch = true;
    if (result.status === 'granted') {
      const next = {
        ...record,
        lastValidatedAt: new Date().toISOString(),
        lastValidatedStatus: 'granted',
        benefitId: result.benefitId || record.benefitId,
      };
      writeRecord(next);
      return next;
    }
    const next = { ...record, lastValidatedStatus: 'revoked' };
    writeRecord(next);
    return next;
  } catch (err) {
    validatedThisLaunch = true;
    if (err && err.code === 'revoked') {
      const next = { ...record, lastValidatedStatus: 'revoked' };
      writeRecord(next);
      return next;
    }
    if (record.lastValidatedStatus === 'granted' || !record.lastValidatedStatus) {
      const next = {
        ...record,
        lastValidatedStatus: 'offline',
        lastValidatedAt: record.lastValidatedAt || new Date().toISOString(),
      };
      writeRecord(next);
      return next;
    }
    return record;
  }
}

async function getStatus() {
  if (!isGated()) return statusFrom(emptyRecord());
  let record = readRecord();
  record = ensureTrialStarted(record, nowMs());
  record = await refreshValidation(record);
  return statusFrom(record);
}

async function activate(key) {
  const record = isGated() ? ensureTrialStarted(readRecord(), nowMs()) : readRecord();
  try {
    const result = await polar.activate(key);
    validatedThisLaunch = true;
    const next = {
      ...record,
      key: result.key,
      activationId: result.activationId,
      benefitId: result.benefitId,
      lastValidatedAt: new Date().toISOString(),
      lastValidatedStatus: 'granted',
    };
    if (isGated()) writeRecord(next);
    return { ok: true, status: statusFrom(next) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not activate that license key.';
    const code = err && err.code ? String(err.code) : 'polar-error';
    return { ok: false, status: statusFrom(record), error: message, code };
  }
}

async function buy() {
  const url = config.checkoutUrl;
  if (!url) {
    return { ok: false, error: 'License checkout is not configured in this build.' };
  }
  try {
    const { shell } = require('electron');
    await shell.openExternal(url);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not open the Polar checkout page.' };
  }
}

module.exports = {
  TRIAL_DAYS,
  GRACE_DAYS,
  TRIAL_MS,
  GRACE_MS,
  isGated,
  licensePath,
  displayKey,
  remainingDays,
  deriveLicenseStatus,
  getStatus,
  activate,
  buy,
};
