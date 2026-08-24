import './polyfillGetRandomValues';
import { sha256 } from '@noble/hashes/sha256';
import { gcm } from '@noble/ciphers/aes';

const CRYPTO_SALT = 'speakfiction-notes-v1:';
const ACCOUNT_SALT = 'speakfiction-account-v1:';

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesFromBase64(value: string): Uint8Array {
  const bin = globalThis.atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64FromBytes(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return globalThis.btoa(bin);
}

export async function notesAccountHash(licenseKey: string): Promise<string> {
  return hex(sha256(`${ACCOUNT_SALT}${licenseKey.trim()}`));
}

function notesKeyBytes(licenseKey: string): Uint8Array {
  return sha256(`${CRYPTO_SALT}${licenseKey.trim()}`);
}

export async function encryptNotePayload(
  licenseKey: string,
  payload: Record<string, unknown>,
) {
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const ct = gcm(notesKeyBytes(licenseKey), iv).encrypt(encoded);
  return { v: 1 as const, iv: base64FromBytes(iv), ct: base64FromBytes(ct) };
}

export async function decryptNotePayload(
  licenseKey: string,
  envelope: { v: 1; iv: string; ct: string },
): Promise<{
  kind: string;
  text: string;
  bookHint?: string;
  bookId?: string;
  title?: string;
  books?: unknown;
  genreId?: string;
  id?: string;
  seriesName?: string;
  seriesBookNumber?: number;
}> {
  const raw = gcm(notesKeyBytes(licenseKey), bytesFromBase64(envelope.iv)).decrypt(
    bytesFromBase64(envelope.ct),
  );
  const parsed = JSON.parse(new TextDecoder().decode(raw)) as Record<string, unknown>;
  return {
    kind: parsed.kind === 'library' || parsed.kind === 'create-book' ? parsed.kind : 'note',
    text: typeof parsed.text === 'string' ? parsed.text : '',
    bookHint: typeof parsed.bookHint === 'string' ? parsed.bookHint : undefined,
    bookId: typeof parsed.bookId === 'string' ? parsed.bookId : undefined,
    title: typeof parsed.title === 'string' ? parsed.title : undefined,
    books: parsed.books,
    genreId: typeof parsed.genreId === 'string' ? parsed.genreId : undefined,
    id: typeof parsed.id === 'string' ? parsed.id : undefined,
    seriesName: typeof parsed.seriesName === 'string' && parsed.seriesName.trim() ? parsed.seriesName.trim() : undefined,
    seriesBookNumber:
      typeof parsed.seriesBookNumber === 'number' && Number.isFinite(parsed.seriesBookNumber) && parsed.seriesBookNumber > 0
        ? parsed.seriesBookNumber
        : typeof parsed.seriesBookNumber === 'string' && Number(parsed.seriesBookNumber) > 0
          ? Number(parsed.seriesBookNumber)
          : undefined,
  };
}

export const SF_LICENSE_KEY_RE = /^SF-[A-Za-z0-9-]{8,}$/;
