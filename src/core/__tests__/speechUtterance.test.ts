import { describe, expect, it } from 'vitest';
import {
  MIN_COMMAND_S,
  MIN_ONSET_MS,
  MIN_SPEECH_S,
  SILENCE_MS,
  SPEECH_RMS,
  UtteranceSlicer,
  createDecodeQueue,
  shouldCommitDecoded,
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
  it('keeps a quiet cue prefix with the louder title that follows a short breath', () => {
    const slicer = new UtteranceSlicer();
    expect(pushMs(slicer, 280, 0.009)).toEqual([]);
    expect(pushMs(slicer, 80, 0)).toEqual([]);
    expect(pushMs(slicer, 800, 0.05)).toEqual([]);
    const committed = pushMs(slicer, SILENCE_MS + 40, 0);
    expect(committed).toHaveLength(1);
    expect(shouldSkipDecode(committed[0])).toBe(false);
    expect(committed[0].speechMs).toBeGreaterThan(900);
  });

  it('does not treat a lone click as an utterance', () => {
    const slicer = new UtteranceSlicer();
    const segs = [...pushMs(slicer, 40, 0.04), ...pushMs(slicer, SILENCE_MS + 40, 0)];
    expect(segs).toEqual([]);
    expect(40).toBeLessThan(MIN_ONSET_MS);
  });

  it('commits a short new-paragraph-length utterance instead of dropping it as a click', () => {
    const slicer = new UtteranceSlicer();
    pushMs(slicer, 320, 0.03);
    const committed = pushMs(slicer, SILENCE_MS + 40, 0);
    expect(committed).toHaveLength(1);
    expect(committed[0].speechMs).toBeGreaterThan(MIN_COMMAND_S * 1000);
    expect(committed[0].speechMs).toBeLessThan(MIN_SPEECH_S * 1000);
    expect(shouldSkipDecode(committed[0])).toBe(false);
  });

  it('keeps quiet speech above the VAD floor as one utterance', () => {
    const slicer = new UtteranceSlicer();
    expect(SPEECH_RMS).toBeLessThan(0.012);
    pushMs(slicer, 500, 0.008);
    const committed = pushMs(slicer, SILENCE_MS + 40, 0);
    expect(committed).toHaveLength(1);
    expect(shouldSkipDecode(committed[0])).toBe(false);
  });
});

describe('shouldSkipDecode / shouldCommitDecoded', () => {
  it('does not skip short structure cues or quiet speech', () => {
    expect(shouldSkipDecode(utt({ avgRms: 0.02, speechMs: 280 }))).toBe(false);
    expect(shouldSkipDecode(utt({ avgRms: 0.008, speechMs: 400 }))).toBe(false);
    expect(shouldSkipDecode(utt({ avgRms: 0.04, speechMs: 40 }))).toBe(true);
  });

  it('commits cleaned text regardless of speechMs', () => {
    expect(shouldCommitDecoded('new paragraph', { listening: true })).toBe(true);
    expect(shouldCommitDecoded('new scene', { listening: true })).toBe(true);
    expect(
      shouldCommitDecoded('new chapter titled The Gate period the wind howled', { listening: true }),
    ).toBe(true);
    expect(shouldCommitDecoded('', { listening: true })).toBe(false);
    expect(shouldCommitDecoded('hello', { listening: false })).toBe(false);
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
    expect(shouldSkipDecode(silenceJob)).toBe(false);

    q.submit(silenceJob);
    q.submit(speechJob);
    release();
    await q.idle();
    expect(commits).toEqual(['the morning started like any other morning']);
  });

  it('still decodes speech after a pause while a prior job is in flight', async () => {
    // Invariant: in-flight jobs are never marked stale. A pause + louder
    // follow-up must not skip the decode that already started, and the
    // follow-up must still run.
    const commits: string[] = [];
    const started: number[] = [];
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const q = createDecodeQueue({
      transcribe: async (samples) => {
        started.push(samples[0]);
        if (samples[0] === 1) {
          await hold;
          return 'new chapter';
        }
        return 'The rain started. She closed the door and waited.';
      },
      onText: (text) => commits.push(text),
    });

    q.submit(utt({ avgRms: 0.018, speechMs: 420, samples: new Float32Array([1]) }));
    q.submit(utt({ avgRms: 0.05, speechMs: 1400, samples: new Float32Array([2]) }));
    release();
    await q.idle();
    expect(started).toEqual([1, 2]);
    expect(commits).toEqual(['new chapter', 'The rain started. She closed the door and waited.']);
  });

  it('decodes a short cue even when a longer sentence is already queued', async () => {
    const started: number[] = [];
    const commits: string[] = [];
    const q = createDecodeQueue({
      transcribe: async (samples) => {
        started.push(samples[0]);
        return samples[0] === 1 ? 'new paragraph' : 'the morning started';
      },
      onText: (text) => commits.push(text),
    });
    q.submit(utt({ avgRms: 0.013, speechMs: 320, samples: new Float32Array([1]) }));
    q.submit(utt({ avgRms: 0.05, speechMs: 900, samples: new Float32Array([2]) }));
    await q.idle();
    expect(started).toEqual([1, 2]);
    expect(commits).toEqual(['new paragraph', 'the morning started']);
  });
});
