import type { Block } from './types';
import { uid } from './util';
import {
  EDIT_DEBOUNCE_MS,
  MAX_RECOVERY_POINTS,
  planRecoveryPoint,
  idsToPrune,
  sortRecoveryPoints,
  type RecoveryPoint,
  type RecoveryPointMeta,
  type RecoveryReason,
} from './manuscriptVersions';

export interface VersionBackend {
  list(bookId: string): Promise<RecoveryPointMeta[]>;
  load(bookId: string, id: string): Promise<RecoveryPoint | null>;
  save(point: RecoveryPoint): Promise<void>;
  remove(bookId: string, id: string): Promise<void>;
  removeBook(bookId: string): Promise<void>;
}

export interface VersionScheduleHandle {
  cancel: () => void;
}

export function createManuscriptVersionRecorder(opts: {
  backend: VersionBackend;
  debounceMs?: number;
  maxPoints?: number;
  now?: () => number;
  uid?: () => string;
  schedule?: (fn: () => void, ms: number) => VersionScheduleHandle;
}) {
  const debounceMs = opts.debounceMs ?? EDIT_DEBOUNCE_MS;
  const maxPoints = opts.maxPoints ?? MAX_RECOVERY_POINTS;
  const now = opts.now ?? Date.now;
  const makeId = opts.uid ?? (() => uid('msv'));
  const schedule =
    opts.schedule ??
    ((fn, ms) => {
      const timer = setTimeout(fn, ms);
      return { cancel: () => clearTimeout(timer) };
    });

  const pending = new Map<string, Block[]>();
  const timers = new Map<string, VersionScheduleHandle>();
  const latest = new Map<string, RecoveryPointMeta | null>();
  const listeners = new Set<(bookId: string) => void>();

  function emit(bookId: string) {
    for (const listener of listeners) listener(bookId);
  }

  async function cachedLatest(bookId: string): Promise<RecoveryPointMeta | null> {
    if (!latest.has(bookId)) {
      const list = sortRecoveryPoints(await opts.backend.list(bookId));
      latest.set(bookId, list[0] ?? null);
    }
    return latest.get(bookId) ?? null;
  }

  async function capture(
    bookId: string,
    blocks: Block[],
    reason: RecoveryReason,
  ): Promise<RecoveryPoint | null> {
    const planned = planRecoveryPoint({
      latest: await cachedLatest(bookId),
      blocks,
      reason,
      now: now(),
      id: makeId(),
      bookId,
    });
    if (!planned) return null;
    await opts.backend.save(planned);
    const listed = sortRecoveryPoints(await opts.backend.list(bookId));
    const drop = idsToPrune(listed, maxPoints);
    for (const id of drop) {
      await opts.backend.remove(bookId, id);
    }
    latest.set(bookId, planned);
    emit(bookId);
    return planned;
  }

  async function flushQueued(bookId: string): Promise<void> {
    const queued = pending.get(bookId);
    pending.delete(bookId);
    timers.get(bookId)?.cancel();
    timers.delete(bookId);
    if (queued) await capture(bookId, queued, 'edit');
  }

  function note(bookId: string, blocks: Block[], reason: RecoveryReason): Promise<void> {
    if (reason === 'edit') {
      pending.set(bookId, blocks);
      timers.get(bookId)?.cancel();
      timers.set(
        bookId,
        schedule(() => {
          timers.delete(bookId);
          const queued = pending.get(bookId);
          pending.delete(bookId);
          if (queued) void capture(bookId, queued, 'edit');
        }, debounceMs),
      );
      return Promise.resolve();
    }
    return (async () => {
      await flushQueued(bookId);
      await capture(bookId, blocks, reason);
    })();
  }

  async function flush(bookId: string, blocks?: Block[]): Promise<void> {
    if (blocks) pending.set(bookId, blocks);
    await flushQueued(bookId);
  }

  async function list(bookId: string): Promise<RecoveryPointMeta[]> {
    const points = sortRecoveryPoints(await opts.backend.list(bookId));
    latest.set(bookId, points[0] ?? null);
    return points;
  }

  async function load(bookId: string, id: string): Promise<RecoveryPoint | null> {
    return opts.backend.load(bookId, id);
  }

  async function ensureBaseline(bookId: string, blocks: Block[]): Promise<void> {
    const existing = await list(bookId);
    if (existing.length) return;
    await capture(bookId, blocks, 'baseline');
  }

  async function removeBook(bookId: string): Promise<void> {
    pending.delete(bookId);
    timers.get(bookId)?.cancel();
    timers.delete(bookId);
    latest.delete(bookId);
    await opts.backend.removeBook(bookId);
    emit(bookId);
  }

  function subscribe(listener: (bookId: string) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    note,
    flush,
    list,
    load,
    capture,
    ensureBaseline,
    removeBook,
    subscribe,
  };
}

export type ManuscriptVersionRecorder = ReturnType<typeof createManuscriptVersionRecorder>;
