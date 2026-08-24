import { isSpeakFictionLicenseKey, normalizeLicenseKey } from './voiceNotes';

export const COMPANION_PAIR_PROTOCOL = 'speakfiction:';
export const COMPANION_PAIR_HOST = 'pair';

/** Custom URL the desktop QR encodes. The phone reads only this, or a raw SF- key. */
export function encodeCompanionPairing(licenseKey: string): string {
  const key = normalizeLicenseKey(licenseKey);
  const url = new URL(`${COMPANION_PAIR_PROTOCOL}//${COMPANION_PAIR_HOST}`);
  url.searchParams.set('v', '1');
  url.searchParams.set('k', key);
  return url.toString();
}

export function parseCompanionPairing(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  if (isSpeakFictionLicenseKey(text)) return normalizeLicenseKey(text);

  if (text.startsWith('{')) {
    try {
      const rec = JSON.parse(text) as { k?: unknown; key?: unknown };
      const fromJson = normalizeLicenseKey(rec.k ?? rec.key);
      return isSpeakFictionLicenseKey(fromJson) ? fromJson : null;
    } catch {
      return null;
    }
  }

  try {
    const url = new URL(text);
    if (url.protocol !== COMPANION_PAIR_PROTOCOL) return null;
    const host = url.hostname || url.host.replace(/:[0-9]+$/, '');
    const path = url.pathname.replace(/^\//, '');
    if (host !== COMPANION_PAIR_HOST && path !== COMPANION_PAIR_HOST) return null;
    const fromUrl = normalizeLicenseKey(url.searchParams.get('k') ?? url.searchParams.get('key'));
    return isSpeakFictionLicenseKey(fromUrl) ? fromUrl : null;
  } catch {
    return null;
  }
}
