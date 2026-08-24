import { SF_LICENSE_KEY_RE } from './notesCrypto';

export function parseCompanionPairing(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  if (SF_LICENSE_KEY_RE.test(text)) return text;

  if (text.startsWith('{')) {
    try {
      const rec = JSON.parse(text) as { k?: unknown; key?: unknown };
      const fromJson = typeof rec.k === 'string' ? rec.k.trim() : typeof rec.key === 'string' ? rec.key.trim() : '';
      return SF_LICENSE_KEY_RE.test(fromJson) ? fromJson : null;
    } catch {
      return null;
    }
  }

  try {
    const url = new URL(text);
    if (url.protocol !== 'speakfiction:') return null;
    const host = url.hostname || url.host.replace(/:[0-9]+$/, '');
    const path = url.pathname.replace(/^\//, '');
    if (host !== 'pair' && path !== 'pair') return null;
    const fromUrl = (url.searchParams.get('k') ?? url.searchParams.get('key') ?? '').trim();
    return SF_LICENSE_KEY_RE.test(fromUrl) ? fromUrl : null;
  } catch {
    return null;
  }
}
