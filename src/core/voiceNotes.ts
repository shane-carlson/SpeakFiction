/** Voice notes: phone companion + desktop file import. Synced audio stays until the take is deleted. */

import { parseCompanionPayload, type CompanionPayload } from './companionLibrary';

export type { CompanionBook, CompanionPayload } from './companionLibrary';
export { catalogFromBooks, defaultTakeTitle, isHiddenCompanionNoteId } from './companionLibrary';

export const NOTES_CRYPTO_SALT = 'speakfiction-notes-v1:';
export const NOTES_ACCOUNT_SALT = 'speakfiction-account-v1:';

export const VOICE_NOTE_STATUSES = ['inbox', 'imported', 'dismissed', 'deleted'] as const;
export type VoiceNoteStatus = (typeof VOICE_NOTE_STATUSES)[number];

export const VOICE_NOTE_SOURCES = ['phone', 'file', 'paste'] as const;
export type VoiceNoteSource = (typeof VOICE_NOTE_SOURCES)[number];

export interface VoiceNote {
  id: string;
  createdAt: string;
  durationMs: number;
  platform: string;
  text: string;
  title?: string;
  bookId?: string;
  bookHint?: string;
  status: VoiceNoteStatus;
  source: VoiceNoteSource;
  fileName?: string;
  hasAudio?: boolean;
  recordOnly?: boolean;
}

export interface VoiceNoteCipherEnvelope {
  v: 1;
  iv: string;
  ct: string;
}

export const SF_LICENSE_KEY_RE = /^SF-[A-Za-z0-9-]{8,}$/;

export function normalizeLicenseKey(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isSpeakFictionLicenseKey(value: unknown): boolean {
  return SF_LICENSE_KEY_RE.test(normalizeLicenseKey(value));
}

export function isVoiceNoteStatus(value: unknown): value is VoiceNoteStatus {
  return VOICE_NOTE_STATUSES.includes(value as VoiceNoteStatus);
}

export function createVoiceNoteId(): string {
  return `vn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const REMOTE_VOICE_TAKE_PLACEHOLDER = 'Voice only take. Import to transcribe.';
export const LEGACY_REMOTE_VOICE_TAKE_PLACEHOLDER = 'Voice take. Transcribe on the computer.';

export function isRemoteVoiceTakePlaceholder(text: string | undefined): boolean {
  const value = (text || '').trim();
  return value === REMOTE_VOICE_TAKE_PLACEHOLDER || value === LEGACY_REMOTE_VOICE_TAKE_PLACEHOLDER;
}

export function noteNeedsDesktopTranscription(
  note: Pick<VoiceNote, 'text' | 'hasAudio' | 'source'> & { recordOnly?: boolean },
): boolean {
  if (note.source === 'file') return false;
  if (note.recordOnly) return Boolean(note.hasAudio);
  return isRemoteVoiceTakePlaceholder(note.text) || (Boolean(note.hasAudio) && !(note.text || '').trim());
}

/** Phone audio on this computer — desktop Whisper should hear it, even if the phone already typed a transcript. */
export function noteCanDesktopHear(
  note: Pick<VoiceNote, 'hasAudio' | 'source'>,
): boolean {
  return note.source === 'phone' && Boolean(note.hasAudio);
}

/** Prefer the computer’s hearing; keep the phone’s words if desktop STT came back empty. */
export function transcriptAfterDesktopHear(desktop: string, phone: string): string {
  const heard = desktop.replace(/\s+/g, ' ').trim();
  if (heard) return heard;
  if (isRemoteVoiceTakePlaceholder(phone)) return '';
  return (phone || '').replace(/\s+/g, ' ').trim();
}

const STATUS_RANK: Record<VoiceNoteStatus, number> = {
  inbox: 0,
  imported: 1,
  dismissed: 1,
  deleted: 2,
};

/** Collapse duplicate ids and keep a local dismiss/import ahead of a stale remote inbox row. */
export function mergeVoiceNotes(
  remote: VoiceNote[],
  local: VoiceNote[] = [],
  pending: Partial<Record<string, VoiceNoteStatus>> = {},
): VoiceNote[] {
  const byId = new Map<string, VoiceNote>();
  const put = (note: VoiceNote | undefined) => {
    if (!note?.id) return;
    const forced = pending[note.id];
    const next: VoiceNote = forced ? { ...note, status: forced } : note;
    const prev = byId.get(next.id);
    if (!prev) {
      byId.set(next.id, next);
      return;
    }
    const prevRank = STATUS_RANK[prev.status] ?? 0;
    const nextRank = STATUS_RANK[next.status] ?? 0;
    if (nextRank > prevRank) {
      byId.set(next.id, { ...prev, ...next, status: next.status });
      return;
    }
    if (nextRank === prevRank && String(next.createdAt) >= String(prev.createdAt)) {
      byId.set(next.id, { ...next, status: prev.status !== 'inbox' ? prev.status : next.status });
    }
  };
  for (const note of remote) put(note);
  for (const note of local) {
    const existing = byId.get(note.id);
    if (!existing) {
      put(note);
      continue;
    }
    const forced = pending[note.id] || (note.status !== 'inbox' && existing.status === 'inbox' ? note.status : null);
    if (forced) byId.set(note.id, { ...existing, status: forced });
  }
  return [...byId.values()]
    .filter((note) => note.status !== 'deleted')
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function hexFromBuffer(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesFromBase64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64FromBytes(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function sha256Bytes(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
}

export async function notesAccountHash(licenseKey: string): Promise<string> {
  const key = normalizeLicenseKey(licenseKey);
  if (!key) return '';
  return hexFromBuffer(await sha256Bytes(`${NOTES_ACCOUNT_SALT}${key}`));
}

async function notesCryptoKey(licenseKey: string): Promise<CryptoKey> {
  const material = await sha256Bytes(`${NOTES_CRYPTO_SALT}${normalizeLicenseKey(licenseKey)}`);
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptNotePayload(
  licenseKey: string,
  payload: Partial<CompanionPayload> & { text?: string; bookHint?: string },
): Promise<VoiceNoteCipherEnvelope> {
  const key = await notesCryptoKey(licenseKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded));
  return { v: 1, iv: base64FromBytes(iv), ct: base64FromBytes(ct) };
}

export async function decryptNotePayload(
  licenseKey: string,
  envelope: VoiceNoteCipherEnvelope,
): Promise<CompanionPayload> {
  const key = await notesCryptoKey(licenseKey);
  const iv = bytesFromBase64(envelope.iv);
  const ct = bytesFromBase64(envelope.ct);
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ct as BufferSource,
  );
  return parseCompanionPayload(JSON.parse(new TextDecoder().decode(raw)));
}

export function isCipherEnvelope(value: unknown): value is VoiceNoteCipherEnvelope {
  if (!value || typeof value !== 'object') return false;
  const rec = value as Record<string, unknown>;
  return rec.v === 1 && typeof rec.iv === 'string' && typeof rec.ct === 'string';
}
