import type { Block } from './types';
import { manuscriptStats } from './manuscript';

export const MAX_RECOVERY_POINTS = 40;
export const EDIT_DEBOUNCE_MS = 10_000;

export type RecoveryReason = 'dictate' | 'edit' | 'structure' | 'restore' | 'baseline';

export interface RecoveryPointMeta {
  id: string;
  bookId: string;
  createdAt: number;
  reason: RecoveryReason;
  wordCount: number;
  blockCount: number;
  fingerprint: string;
}

export interface RecoveryPoint extends RecoveryPointMeta {
  blocks: Block[];
}

export function cloneBlocks(blocks: Block[]): Block[] {
  return JSON.parse(JSON.stringify(blocks)) as Block[];
}

export function fingerprintBlocks(blocks: Block[]): string {
  return JSON.stringify(blocks);
}

export function manuscriptHasRecoverableContent(blocks: Block[]): boolean {
  if (!blocks.length) return false;
  const stats = manuscriptStats({ blocks });
  if (stats.words > 0 || stats.images > 0 || stats.tables > 0) return true;
  return blocks.some(
    (b) =>
      (b.type === 'chapter' || b.type === 'scene' || b.type === 'section') &&
      Boolean((b.title ?? '').trim()),
  );
}

export function summarizeBlocks(blocks: Block[]): {
  wordCount: number;
  blockCount: number;
  fingerprint: string;
} {
  return {
    wordCount: manuscriptStats({ blocks }).words,
    blockCount: blocks.length,
    fingerprint: fingerprintBlocks(blocks),
  };
}

export function planRecoveryPoint(opts: {
  latest: RecoveryPointMeta | null;
  blocks: Block[];
  reason: RecoveryReason;
  now: number;
  id: string;
  bookId: string;
}): RecoveryPoint | null {
  if (!manuscriptHasRecoverableContent(opts.blocks)) return null;
  const summary = summarizeBlocks(opts.blocks);
  if (opts.latest && opts.latest.fingerprint === summary.fingerprint) return null;
  return {
    id: opts.id,
    bookId: opts.bookId,
    createdAt: opts.now,
    reason: opts.reason,
    wordCount: summary.wordCount,
    blockCount: summary.blockCount,
    fingerprint: summary.fingerprint,
    blocks: cloneBlocks(opts.blocks),
  };
}

/** Newest first. Drop ids beyond `keep`. */
export function idsToPrune(points: RecoveryPointMeta[], keep = MAX_RECOVERY_POINTS): string[] {
  const sorted = [...points].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  return sorted.slice(Math.max(0, keep)).map((p) => p.id);
}

export function recoveryReasonLabel(reason: RecoveryReason): string {
  switch (reason) {
    case 'dictate':
      return 'After dictation';
    case 'structure':
      return 'After a structure change';
    case 'restore':
      return 'Before restore';
    case 'baseline':
      return 'Saved manuscript';
    default:
      return 'After editing';
  }
}

export function formatRecoveryWhen(createdAt: number, now = Date.now()): string {
  const delta = Math.max(0, now - createdAt);
  if (delta < 45_000) return 'Just now';
  if (delta < 90_000) return '1 min ago';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} min ago`;
  if (delta < 5_400_000) return '1 hr ago';
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} hr ago`;
  const days = Math.floor(delta / 86_400_000);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(createdAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function isRecoveryReason(value: unknown): value is RecoveryReason {
  return (
    value === 'dictate' ||
    value === 'edit' ||
    value === 'structure' ||
    value === 'restore' ||
    value === 'baseline'
  );
}

export function normalizeRecoveryPointMeta(raw: unknown, bookId: string): RecoveryPointMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== 'string' || !rec.id) return null;
  if (typeof rec.createdAt !== 'number' || !Number.isFinite(rec.createdAt)) return null;
  if (!isRecoveryReason(rec.reason)) return null;
  if (typeof rec.fingerprint !== 'string' || !rec.fingerprint) return null;
  const wordCount =
    typeof rec.wordCount === 'number' && Number.isFinite(rec.wordCount) ? rec.wordCount : 0;
  const blockCount =
    typeof rec.blockCount === 'number' && Number.isFinite(rec.blockCount) ? rec.blockCount : 0;
  return {
    id: rec.id,
    bookId: typeof rec.bookId === 'string' && rec.bookId ? rec.bookId : bookId,
    createdAt: rec.createdAt,
    reason: rec.reason,
    wordCount,
    blockCount,
    fingerprint: rec.fingerprint,
  };
}

export function normalizeRecoveryPoint(raw: unknown, bookId: string): RecoveryPoint | null {
  const meta = normalizeRecoveryPointMeta(raw, bookId);
  if (!meta) return null;
  const rec = raw as Record<string, unknown>;
  if (!Array.isArray(rec.blocks)) return null;
  return { ...meta, blocks: rec.blocks as Block[] };
}

export function sortRecoveryPoints<T extends RecoveryPointMeta>(points: T[]): T[] {
  return [...points].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
}
