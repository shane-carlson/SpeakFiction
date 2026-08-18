const os = require('node:os');
const config = require('./polarConfig.cjs');

const VALIDATE_TIMEOUT_MS = 12_000;

class PolarError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'PolarError';
    this.code = code;
    this.status = status;
  }
}

function activationLabel() {
  const host = (os.hostname() || 'SpeakFiction').slice(0, 48);
  return `${host} (${process.platform}/${process.arch})`;
}

function deviceMeta() {
  return { platform: process.platform, arch: process.arch };
}

async function polarPost(pathname, body) {
  if (!config.organizationId) {
    throw new PolarError('Polar is not configured in this build.', 'not-configured', 0);
  }
  const url = `${config.apiBase()}${pathname}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), VALIDATE_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } catch (err) {
    const aborted = err && (err.name === 'AbortError' || err.code === 'ABORT_ERR');
    throw new PolarError(
      aborted ? 'Polar timed out. Check your connection and try again.' : 'Could not reach Polar. Check your connection and try again.',
      'offline',
      0,
    );
  } finally {
    clearTimeout(timer);
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    throw polarHttpError(res.status, payload);
  }
  return payload;
}

function polarHttpError(status, payload) {
  const detail =
    (payload && (payload.detail || payload.error || payload.message)) ||
    (Array.isArray(payload?.detail) && payload.detail[0]?.msg) ||
    '';
  if (status === 404) {
    return new PolarError('That license key was not found.', 'not-found', status);
  }
  if (status === 403) {
    return new PolarError(
      'This key is already used on the maximum number of devices. Deactivate an old Mac or PC in your Polar purchases page, then try again.',
      'activation-limit',
      status,
    );
  }
  if (status === 422) {
    return new PolarError(detail || 'That license key is not valid.', 'invalid', status);
  }
  return new PolarError(detail || `Polar returned ${status}.`, 'polar-error', status);
}

function assertSpeakFictionBenefit(licenseKey) {
  const expected = config.benefitId;
  if (!expected) return;
  const got = licenseKey && licenseKey.benefit_id;
  if (got && got !== expected) {
    throw new PolarError('This key is not a SpeakFiction license.', 'wrong-benefit', 403);
  }
}

function keyStatus(licenseKey) {
  const status = String(licenseKey?.status || '').toLowerCase();
  if (status === 'granted') return 'granted';
  return 'revoked';
}

async function activate(key) {
  const trimmed = String(key || '').trim();
  if (!trimmed) throw new PolarError('Paste the license key from your Polar receipt.', 'empty', 0);
  try {
    const payload = await polarPost('/v1/customer-portal/license-keys/activate', {
      key: trimmed,
      organization_id: config.organizationId,
      label: activationLabel(),
      conditions: deviceMeta(),
      meta: deviceMeta(),
    });
    const licenseKey = payload?.license_key || payload;
    assertSpeakFictionBenefit(licenseKey);
    if (keyStatus(licenseKey) !== 'granted') {
      throw new PolarError('This license is no longer valid.', 'revoked', 403);
    }
    const activationId = payload?.id;
    if (!activationId) {
      throw new PolarError('Polar did not return an activation id.', 'polar-error', 500);
    }
    return {
      key: trimmed,
      activationId,
      benefitId: licenseKey.benefit_id || config.benefitId || '',
      status: 'granted',
    };
  } catch (err) {
    if (!(err instanceof PolarError) || err.code !== 'activation-limit') throw err;
    try {
      const fallback = await validate(trimmed);
      if (fallback.status !== 'granted') throw err;
      return {
        key: trimmed,
        activationId: fallback.activationId || '',
        benefitId: fallback.benefitId || config.benefitId || '',
        status: 'granted',
      };
    } catch {
      throw err;
    }
  }
}

async function validate(key, activationId) {
  const body = {
    key: String(key || '').trim(),
    organization_id: config.organizationId,
    conditions: deviceMeta(),
  };
  if (activationId) body.activation_id = activationId;
  const payload = await polarPost('/v1/customer-portal/license-keys/validate', body);
  const licenseKey = payload?.id ? payload : payload?.license_key || payload;
  assertSpeakFictionBenefit(licenseKey);
  return {
    status: keyStatus(licenseKey),
    benefitId: licenseKey?.benefit_id || '',
    activationId: payload?.activation?.id || activationId || '',
  };
}

module.exports = {
  PolarError,
  activate,
  validate,
  activationLabel,
  polarHttpError,
};
