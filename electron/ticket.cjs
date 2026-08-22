const path = require('node:path');

const DEFAULT_TICKET_URL = 'https://www.readywriter.one/api/speakfiction/ticket';
const SUBMIT_TIMEOUT_MS = 20_000;
const SUMMARY_MAX = 200;
const DESCRIPTION_MAX = 5000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function packageMeta() {
  try {
    return require(path.join(__dirname, '..', 'package.json'));
  } catch {
    return { version: '', buildNumber: 0 };
  }
}

function asString(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function ticketUrl() {
  const fromEnv = asString(process.env.SF_TICKET_URL, 300);
  return fromEnv || DEFAULT_TICKET_URL;
}

async function submit(raw) {
  const kind = raw?.kind === 'feature' ? 'feature' : raw?.kind === 'support' ? 'support' : '';
  if (!kind) return { ok: false, message: 'Choose a support ticket or a feature request.' };

  const summary = asString(raw?.summary, SUMMARY_MAX);
  const description = asString(raw?.description, DESCRIPTION_MAX);
  if (!summary) return { ok: false, message: 'Add a short summary.' };
  if (!description) return { ok: false, message: 'Add a description.' };

  const contactRequested = raw?.contactRequested === true;
  const email = contactRequested ? asString(raw?.email, 200).toLowerCase() : '';
  if (contactRequested) {
    if (!email) return { ok: false, message: 'Add an email so we can reach you.' };
    if (!EMAIL_RE.test(email)) {
      return { ok: false, message: 'That email address does not look valid.' };
    }
  }

  const meta = packageMeta();
  const body = {
    kind,
    summary,
    description,
    contactRequested,
    email,
    appVersion: asString(meta.version, 80),
    buildNumber: asString(String(meta.buildNumber ?? ''), 80),
    platform: process.platform,
    arch: process.arch,
    website: '',
  };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SUBMIT_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(ticketUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } catch (err) {
    const aborted = err && (err.name === 'AbortError' || err.code === 'ABORT_ERR');
    return {
      ok: false,
      message: aborted
        ? 'The ticket request timed out. Check your connection and try again.'
        : 'Could not reach SpeakFiction support. Check your connection and try again.',
    };
  } finally {
    clearTimeout(timer);
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok || !payload || payload.ok !== true) {
    const message =
      (payload && typeof payload.message === 'string' && payload.message.trim()) ||
      'Could not save your ticket. Try again in a moment.';
    return { ok: false, message };
  }

  return { ok: true, id: typeof payload.id === 'string' ? payload.id : '' };
}

module.exports = { submit, DEFAULT_TICKET_URL };
