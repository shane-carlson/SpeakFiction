import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '../types';
import { createManuscriptVersionRecorder } from '../manuscriptVersionRecorder';
import { memoryVersionBackend } from '../manuscriptVersionStore';

const para = (id: string, text: string): Block => ({ id, type: 'paragraph', text });

describe('manuscript version recorder', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces typing into one recovery point after idle', async () => {
    vi.useFakeTimers();
    const backend = memoryVersionBackend();
    const rec = createManuscriptVersionRecorder({
      backend,
      debounceMs: 1000,
      now: () => 1_000,
      uid: () => 'edit-1',
    });
    await rec.note('bk', [para('p1', 'The wind')], 'edit');
    await rec.note('bk', [para('p1', 'The wind howled')], 'edit');
    expect(await rec.list('bk')).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    const list = await rec.list('bk');
    expect(list).toHaveLength(1);
    expect(list[0].wordCount).toBe(3);
    expect(list[0].reason).toBe('edit');
  });

  it('flushes pending edits before a dictation recovery point', async () => {
    const backend = memoryVersionBackend();
    let n = 0;
    const rec = createManuscriptVersionRecorder({
      backend,
      debounceMs: 60_000,
      now: () => ++n,
      uid: () => `id-${n}`,
    });
    await rec.note('bk', [para('p1', 'Typed first')], 'edit');
    await rec.note('bk', [para('p1', 'Typed first'), para('p2', 'Spoken next')], 'dictate');
    const list = await rec.list('bk');
    expect(list.map((p) => p.reason)).toEqual(['dictate', 'edit']);
    const spoken = await rec.load('bk', list[0].id);
    expect(spoken?.blocks.map((b) => b.text)).toEqual(['Typed first', 'Spoken next']);
  });

  it('does not keep a second copy of the same manuscript', async () => {
    const backend = memoryVersionBackend();
    const rec = createManuscriptVersionRecorder({
      backend,
      now: () => 1,
      uid: () => 'same',
    });
    const blocks = [para('p1', 'The wind howled.')];
    await rec.note('bk', blocks, 'dictate');
    await rec.note('bk', blocks, 'structure');
    expect(await rec.list('bk')).toHaveLength(1);
  });

  it('drops oldest points when the cap is reached', async () => {
    const backend = memoryVersionBackend();
    let n = 0;
    const rec = createManuscriptVersionRecorder({
      backend,
      maxPoints: 3,
      now: () => ++n,
      uid: () => `id-${n}`,
    });
    await rec.note('bk', [para('p1', 'one')], 'structure');
    await rec.note('bk', [para('p1', 'one two')], 'structure');
    await rec.note('bk', [para('p1', 'one two three')], 'structure');
    await rec.note('bk', [para('p1', 'one two three four')], 'structure');
    const list = await rec.list('bk');
    expect(list).toHaveLength(3);
    expect(list.map((p) => p.wordCount)).toEqual([4, 3, 2]);
  });
});
