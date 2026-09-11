import { describe, expect, it } from 'vitest';
import type { Block } from '../types';
import {
  formatRecoveryWhen,
  idsToPrune,
  manuscriptHasRecoverableContent,
  planRecoveryPoint,
  recoveryReasonLabel,
  summarizeBlocks,
} from '../manuscriptVersions';

const para = (id: string, text: string): Block => ({ id, type: 'paragraph', text });

describe('manuscript recovery points', () => {
  it('skips an empty manuscript', () => {
    expect(manuscriptHasRecoverableContent([])).toBe(false);
    expect(
      planRecoveryPoint({
        latest: null,
        blocks: [para('p1', '  ')],
        reason: 'edit',
        now: 1,
        id: 'a',
        bookId: 'bk',
      }),
    ).toBeNull();
  });

  it('skips a snapshot that matches the latest fingerprint', () => {
    const blocks = [para('p1', 'The wind howled.')];
    const first = planRecoveryPoint({
      latest: null,
      blocks,
      reason: 'dictate',
      now: 1,
      id: 'a',
      bookId: 'bk',
    });
    expect(first?.wordCount).toBe(3);
    expect(
      planRecoveryPoint({
        latest: first,
        blocks,
        reason: 'edit',
        now: 2,
        id: 'b',
        bookId: 'bk',
      }),
    ).toBeNull();
  });

  it('records a later draft with different words', () => {
    const earlier = planRecoveryPoint({
      latest: null,
      blocks: [para('p1', 'The wind howled.')],
      reason: 'dictate',
      now: 1,
      id: 'a',
      bookId: 'bk',
    });
    const next = planRecoveryPoint({
      latest: earlier,
      blocks: [para('p1', 'The wind howled across the keep.')],
      reason: 'edit',
      now: 2,
      id: 'b',
      bookId: 'bk',
    });
    expect(next?.id).toBe('b');
    expect(next?.reason).toBe('edit');
    expect(summarizeBlocks(next!.blocks).wordCount).toBeGreaterThan(3);
  });

  it('prunes oldest points beyond the cap', () => {
    const points = [1, 2, 3, 4, 5].map((n) => ({
      id: `p${n}`,
      bookId: 'bk',
      createdAt: n,
      reason: 'edit' as const,
      wordCount: n,
      blockCount: 1,
      fingerprint: String(n),
    }));
    expect(idsToPrune(points, 3)).toEqual(['p2', 'p1']);
  });

  it('labels reasons for the versions list', () => {
    expect(recoveryReasonLabel('dictate')).toBe('After dictation');
    expect(recoveryReasonLabel('restore')).toBe('Before restore');
  });

  it('formats recovery time for the list', () => {
    const now = Date.parse('2026-09-11T12:00:00.000Z');
    expect(formatRecoveryWhen(now - 10_000, now)).toBe('Just now');
    expect(formatRecoveryWhen(now - 3 * 60_000, now)).toBe('3 min ago');
    expect(formatRecoveryWhen(now - 3 * 3_600_000, now)).toBe('3 hr ago');
    expect(formatRecoveryWhen(now - 86_400_000, now)).toBe('Yesterday');
  });
});
