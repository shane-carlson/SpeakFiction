import type { Manuscript, ManuscriptImage, ManuscriptImageMime } from './types';
import type { ExportImageBytes } from './manuscriptMedia';
import {
  base64ToBytes,
  bytesToBase64,
  isManuscriptImageMime,
  mimeFromFilename,
  validateImageBytes,
} from './manuscriptMedia';
import { uid } from './util';

const MEMORY = new Map<string, { mime: ManuscriptImageMime; bytes: Uint8Array }>();
const LS_KEY = 'speakfiction-media-v1';

function nativeMedia() {
  return typeof window !== 'undefined' ? window.speakfiction?.media : undefined;
}

function readLocal(): Record<string, { mime: string; b64: string }> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, { mime: string; b64: string }>;
  } catch {
    return {};
  }
}

function writeLocal(id: string, mime: ManuscriptImageMime, bytes: Uint8Array): void {
  try {
    const all = readLocal();
    all[id] = { mime, b64: bytesToBase64(bytes) };
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    /* quota — Electron disk copy still holds the file */
  }
}

function removeLocal(id: string): void {
  try {
    const all = readLocal();
    if (!(id in all)) return;
    delete all[id];
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export async function saveMedia(
  id: string,
  mime: ManuscriptImageMime,
  bytes: Uint8Array,
): Promise<void> {
  MEMORY.set(id, { mime, bytes });
  const native = nativeMedia();
  if (native) {
    await native.save({ id, mime, bytes: Array.from(bytes) });
    return;
  }
  writeLocal(id, mime, bytes);
}

export async function loadMedia(
  id: string,
): Promise<{ mime: ManuscriptImageMime; bytes: Uint8Array } | null> {
  const cached = MEMORY.get(id);
  if (cached) return cached;
  const native = nativeMedia();
  if (native) {
    const res = await native.load(id);
    if (!res?.ok || !res.bytes || !isManuscriptImageMime(res.mime)) return null;
    const bytes = Uint8Array.from(res.bytes);
    MEMORY.set(id, { mime: res.mime, bytes });
    return { mime: res.mime, bytes };
  }
  try {
    const rec = readLocal()[id];
    if (!rec || !isManuscriptImageMime(rec.mime) || typeof rec.b64 !== 'string') return null;
    const bytes = base64ToBytes(rec.b64);
    MEMORY.set(id, { mime: rec.mime, bytes });
    return { mime: rec.mime, bytes };
  } catch {
    return null;
  }
}

export async function removeMedia(id: string): Promise<void> {
  MEMORY.delete(id);
  removeLocal(id);
  const native = nativeMedia();
  if (native) await native.remove(id);
}

export async function loadExportImages(manuscript: Manuscript): Promise<Record<string, ExportImageBytes>> {
  const out: Record<string, ExportImageBytes> = {};
  for (const b of manuscript.blocks) {
    if (b.type !== 'image' || !b.image) continue;
    const { mediaId, mime, alt, caption, width, height } = b.image;
    if (out[mediaId]) continue;
    const loaded = await loadMedia(mediaId);
    if (!loaded) continue;
    out[mediaId] = {
      bytes: loaded.bytes,
      mime: loaded.mime || mime,
      alt,
      caption,
      width,
      height,
    };
  }
  return out;
}

export async function restoreBackupMedia(
  media: Record<string, { mime: string; b64: string }> | undefined,
): Promise<void> {
  if (!media) return;
  for (const [id, rec] of Object.entries(media)) {
    if (!isManuscriptImageMime(rec.mime) || typeof rec.b64 !== 'string') continue;
    await saveMedia(id, rec.mime, base64ToBytes(rec.b64));
  }
}

export async function collectBackupMedia(
  manuscript: Manuscript,
): Promise<Record<string, { mime: string; b64: string }>> {
  const out: Record<string, { mime: string; b64: string }> = {};
  for (const b of manuscript.blocks) {
    if (b.type !== 'image' || !b.image) continue;
    const loaded = await loadMedia(b.image.mediaId);
    if (!loaded) continue;
    out[b.image.mediaId] = { mime: loaded.mime, b64: bytesToBase64(loaded.bytes) };
  }
  return out;
}

function probeImageSize(
  bytes: Uint8Array,
  mime: ManuscriptImageMime,
): Promise<{ width?: number; height?: number }> {
  if (typeof Image === 'undefined' || typeof URL === 'undefined') return Promise.resolve({});
  return new Promise((resolve) => {
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    const blob = new Blob([copy], { type: mime });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: img.naturalWidth || undefined,
        height: img.naturalHeight || undefined,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    img.src = url;
  });
}

export async function ingestManuscriptImage(input: {
  bytes: Uint8Array;
  mime?: string;
  name?: string;
  alt?: string;
  caption?: string;
}): Promise<{ ok: true; image: ManuscriptImage } | { ok: false; reason: string }> {
  const mime = isManuscriptImageMime(input.mime)
    ? input.mime
    : mimeFromFilename(input.name ?? '');
  const check = validateImageBytes(input.bytes, mime);
  if (!check.ok) return check;
  const mediaId = uid('img');
  await saveMedia(mediaId, check.mime, input.bytes);
  const size = await probeImageSize(input.bytes, check.mime);
  return {
    ok: true,
    image: {
      mediaId,
      mime: check.mime,
      alt: input.alt,
      caption: input.caption,
      ...size,
    },
  };
}
