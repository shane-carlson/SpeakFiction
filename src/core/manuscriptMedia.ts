import type { ManuscriptImageMime } from './types';

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'] as const;
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp';
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const MIME_BY_EXT: Record<string, ManuscriptImageMime> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export function isManuscriptImageMime(value: string | undefined | null): value is ManuscriptImageMime {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/gif' || value === 'image/webp';
}

export function mimeFromFilename(name: string): ManuscriptImageMime | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? null;
}

export function mimeFromFile(file: { type?: string; name?: string }): ManuscriptImageMime | null {
  if (isManuscriptImageMime(file.type)) return file.type;
  return file.name ? mimeFromFilename(file.name) : null;
}

export function extForMime(mime: ManuscriptImageMime): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/gif') return 'gif';
  return 'webp';
}

export function validateImageBytes(
  bytes: Uint8Array,
  mime: string | null,
): { ok: true; mime: ManuscriptImageMime } | { ok: false; reason: string } {
  if (!isManuscriptImageMime(mime)) {
    return { ok: false, reason: 'Use a PNG, JPEG, GIF, or WebP image.' };
  }
  if (!bytes.byteLength) return { ok: false, reason: 'That image file is empty.' };
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, reason: 'Images must be 8 MB or smaller.' };
  }
  return { ok: true, mime };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function dataUrlFromBytes(mime: ManuscriptImageMime, bytes: Uint8Array): string {
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

export interface ExportImageBytes {
  bytes: Uint8Array;
  mime: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
}
