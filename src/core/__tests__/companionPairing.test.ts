import { describe, expect, it } from 'vitest';
import { encodeCompanionPairing, parseCompanionPairing } from '../companionPairing';

const KEY = 'SF-ABC12345-LinkMe';

describe('companion pairing payload', () => {
  it('round-trips a license key through the QR URL', () => {
    const payload = encodeCompanionPairing(KEY);
    expect(payload.startsWith('speakfiction://pair')).toBe(true);
    expect(payload).toContain('k=');
    expect(parseCompanionPairing(payload)).toBe(KEY);
  });

  it('accepts a raw SF- key from paste', () => {
    expect(parseCompanionPairing(`  ${KEY}  `)).toBe(KEY);
  });

  it('rejects other QR contents', () => {
    expect(parseCompanionPairing('https://example.com/?k=SF-ABC12345-LinkMe')).toBe(null);
    expect(parseCompanionPairing('not a key')).toBe(null);
    expect(parseCompanionPairing('{"k":"nope"}')).toBe(null);
  });
});
