import { describe, expect, it } from 'vitest';
import {
  GAP_SPLIT_MS,
  MIN_ONSET_MS,
  SILENCE_MS,
  UtteranceSlicer,
  createDecodeQueue,
  isLikelySilence,
  shouldSkipDecode,
  type ReadyUtterance,
} from '../speechUtterance';

const SR = 16_000;
const FRAME_MS = 20;
const FRAME_N = Math.round((SR * FRAME_MS) / 1000);

function frameWithRms(level: number): Float32Array {
  const f = new Float32Array(FRAME_N);
  f.fill(level);
  return f;
}

function pushMs(slicer: UtteranceSlicer, ms: number, level: number): ReadyUtterance[] {
  const frames = Math.round(ms / FRAME_MS);
  const out: ReadyUtterance[] = [];
  for (let i = 0; i < frames; i++) {
    out.push(...slicer.ingest(frameWithRms(level), SR));
  }
  return out;
}

function utt(partial: Partial<ReadyUtterance> & Pick<ReadyUtterance, 'avgRms' | 'speechMs'>): ReadyUtterance {
  return {
    samples: new Float32Array([partial.avgRms]),
    sampleRate: SR,
    listening: true,
    ...partial,
  };
}

describe('UtteranceSlicer', () => {
  it('splits a silence blip from the sentence that follows', () => {
    const slicer = new UtteranceSlicer();
    const first = pushMs(slicer, MIN_ONSET_MS + 80, 0.014);
    expect(first).toEqual([]);
    const split = pushMs(slicer, GAP_SPLIT_MS + 40, 0);
    expect(split).toEqual([]);
    const resumed = pushMs(slicer, MIN_ONSET_MS + 800, 0.05);
    expect(resumed.length).toBe(1);
    expect(resumed[0].avgRms).toBeLessThan(0.02);
    expect(resumed[0].speechMs).toBeLessThan(400);

    const committed = pushMs(slicer, SILENCE_MS + 40, 0);
    expect(committed.length).toBe(1);
    expect(committed[0].avgRms).toBeGreaterThan(0.04);
    expect(committed[0].speechMs).toBeGreaterThan(700);
  });

  it('does not treat a lone click as an utterance', () => {
    const slicer = new UtteranceSlicer();
    const segs = [
      ...pushMs(slicer, 40, 0.04),
      ...pushMs(slicer, SILENCE_MS + 40, 0),
    ];
    expect(segs).toEqual([]);
  });

  it('splits a weak silence prefix from louder speech after a short pause', () => {
    const slicer = new UtteranceSlicer();
    pushMs(slicer, MIN_ONSET_MS + 80, 0.014);
    pushMs(slicer, 180, 0);
    const split = pushMs(slicer, MIN_ONSET_MS + 800, 0.05);
    expect(split.length).toBe(1);
    expect(split[0].avgRms).toBeLessThan(0.02);
    const committed = pushMs(slicer, SILENCE_MS + 40, 0);
    expect(committed.length).toBe(1);
    expect(committed[0].avgRms).toBeGreaterThan(0.04);
    expect(shouldSkipDecode(split[0])).toBe(true);
    expect(shouldSkipDecode(committed[0])).toBe(false);
  });
});

describe('DecodeQueue', () => {
  it('rejects a silence loop and still commits the following sentence', async () => {
    const commits: string[] = [];
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const q = createDecodeQueue({
      transcribe: async (samples) => {
        if (samples[0] < 0.02) {
          await hold;
          return 'no, no';
        }
        return 'the morning started like any other morning';
      },
      onText: (text) => commits.push(text),
    });

    const silenceJob = utt({ avgRms: 0.013, speechMs: 400, samples: new Float32Array([0.013]) });
    const speechJob = utt({ avgRms: 0.05, speechMs: 900, samples: new Float32Array([0.05]) });
    expect(isLikelySilence(silenceJob)).toBe(true);
    expect(shouldSkipDecode(silenceJob)).toBe(false);

    q.submit(silenceJob);
    q.submit(speechJob);
    release();
    await q.idle();
    expect(commits).toEqual(['the morning started like any other morning']);
  });

  it('does not start Whisper on a weak segment when real speech is already queued', async () => {
    const started: number[] = [];
    const q = createDecodeQueue({
      transcribe: async (samples) => {
        started.push(samples[0]);
        return samples[0] < 0.02 ? 'no, no' : 'the morning started';
      },
      onText: () => undefined,
    });
    q.submit(utt({ avgRms: 0.013, speechMs: 400, samples: new Float32Array([0.013]) }));
    q.submit(utt({ avgRms: 0.05, speechMs: 900, samples: new Float32Array([0.05]) }));
    await q.idle();
    expect(started).toHaveLength(1);
    expect(started[0]).toBeCloseTo(0.05, 5);
  });
});
