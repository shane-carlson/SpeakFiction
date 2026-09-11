import {
  normalizeRecoveryPoint,
  normalizeRecoveryPointMeta,
  sortRecoveryPoints,
  type RecoveryPoint,
  type RecoveryPointMeta,
} from './manuscriptVersions';
import type { VersionBackend } from './manuscriptVersionRecorder';

const LS_PREFIX = 'speakfiction-ms-versions-v1:';

function nativeVersions() {
  return typeof window !== 'undefined' ? window.speakfiction?.versions : undefined;
}

function lsKey(bookId: string): string {
  return `${LS_PREFIX}${bookId}`;
}

function readLocal(bookId: string): RecoveryPoint[] {
  try {
    const raw = localStorage.getItem(lsKey(bookId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return [];
    const rec = parsed as Record<string, unknown>;
    const list = Array.isArray(rec.points) ? rec.points : [];
    return list
      .map((item) => normalizeRecoveryPoint(item, bookId))
      .filter((item): item is RecoveryPoint => Boolean(item));
  } catch {
    return [];
  }
}

function writeLocal(bookId: string, points: RecoveryPoint[]): void {
  try {
    localStorage.setItem(lsKey(bookId), JSON.stringify({ version: 1, points }));
  } catch {
    /* quota / private mode */
  }
}

function localBackend(): VersionBackend {
  return {
    async list(bookId) {
      return sortRecoveryPoints(readLocal(bookId)).map((p) => {
        const { blocks: _blocks, ...meta } = p;
        return meta;
      });
    },
    async load(bookId, id) {
      return readLocal(bookId).find((p) => p.id === id) ?? null;
    },
    async save(point) {
      const next = sortRecoveryPoints([
        point,
        ...readLocal(point.bookId).filter((p) => p.id !== point.id),
      ]);
      writeLocal(point.bookId, next);
    },
    async remove(bookId, id) {
      writeLocal(
        bookId,
        readLocal(bookId).filter((p) => p.id !== id),
      );
    },
    async removeBook(bookId) {
      try {
        localStorage.removeItem(lsKey(bookId));
      } catch {
        /* ignore */
      }
    },
  };
}

function nativeBackend(): VersionBackend {
  const native = nativeVersions()!;
  return {
    async list(bookId) {
      const result = await native.list(bookId);
      const points = (result.points ?? [])
        .map((item) => normalizeRecoveryPointMeta(item, bookId))
        .filter((item): item is RecoveryPointMeta => Boolean(item));
      return sortRecoveryPoints(points);
    },
    async load(bookId, id) {
      const result = await native.load(bookId, id);
      return result.point ? normalizeRecoveryPoint(result.point, bookId) : null;
    },
    async save(point) {
      await native.save(point);
    },
    async remove(bookId, id) {
      await native.remove(bookId, id);
    },
    async removeBook(bookId) {
      await native.removeBook(bookId);
    },
  };
}

export function defaultVersionBackend(): VersionBackend {
  return nativeVersions() ? nativeBackend() : localBackend();
}

export function memoryVersionBackend(seed?: RecoveryPoint[]): VersionBackend {
  const byBook = new Map<string, RecoveryPoint[]>();
  for (const point of seed ?? []) {
    const list = byBook.get(point.bookId) ?? [];
    list.push(point);
    byBook.set(point.bookId, list);
  }
  return {
    async list(bookId) {
      return sortRecoveryPoints(byBook.get(bookId) ?? []).map((p) => {
        const { blocks: _blocks, ...meta } = p;
        return meta;
      });
    },
    async load(bookId, id) {
      return (byBook.get(bookId) ?? []).find((p) => p.id === id) ?? null;
    },
    async save(point) {
      const next = sortRecoveryPoints([
        point,
        ...(byBook.get(point.bookId) ?? []).filter((p) => p.id !== point.id),
      ]);
      byBook.set(point.bookId, next);
    },
    async remove(bookId, id) {
      byBook.set(
        bookId,
        (byBook.get(bookId) ?? []).filter((p) => p.id !== id),
      );
    },
    async removeBook(bookId) {
      byBook.delete(bookId);
    },
  };
}
