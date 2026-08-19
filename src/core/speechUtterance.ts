import { concatFloat32, rms } from './resample';
import { cleanTranscript } from './transcriptCleanup';

/** Frame energy that counts as voice activity. */
export const SPEECH_RMS = 0.012;
/** Skip Whisper on buffers that are effectively silence/noise. */
export const MIN_DECODE_RMS = 0.012;
/** Commit after this much trailing silence. */
export const SILENCE_MS = 1100;
/** Resume-after-pause splits so a silence hallucination is not glued to the next sentence. */
export const GAP_SPLIT_MS = 450;
/** Keep a short pad so word endings are not clipped; do not send a full silence tail to Whisper. */
export const SILENCE_PAD_MS = 180;
/** Ignore clicks/pops that never become sustained speech. */
export const MIN_ONSET_MS = 140;
export const MIN_SPEECH_S = 0.7;
export const MIN_COMMAND_S = 0.3;
export const MAX_UTTERANCE_S = 12;

export interface ReadyUtterance {
  samples: Float32Array;
  sampleRate: number;
  speechMs: number;
  avgRms: number;
  listening: boolean;
  stale?: boolean;
}

export function isLikelySilence(u: Pick<ReadyUtterance, 'avgRms' | 'speechMs'>): boolean {
  return u.avgRms < MIN_DECODE_RMS * 1.4 || (u.avgRms < 0.02 && u.speechMs < MIN_SPEECH_S * 1000);
}

export function shouldSkipDecode(u: Pick<ReadyUtterance, 'avgRms' | 'speechMs'>): boolean {
  return u.speechMs < MIN_COMMAND_S * 1000 || u.avgRms < MIN_DECODE_RMS;
}

function takeConcat(chunks: Float32Array[]): Float32Array {
  return concatFloat32(chunks);
}

/**
 * Voice-activity slicer: one mic pipeline, many utterances.
 * Capture is never blocked by an in-flight Whisper job.
 */
export class UtteranceSlicer {
  private chunks: Float32Array[] = [];
  private onsetChunks: Float32Array[] = [];
  private speaking = false;
  private silenceMs = 0;
  private speechMs = 0;
  private onsetMs = 0;
  private onsetSilenceMs = 0;
  private energySum = 0;
  private energyFrames = 0;
  private sampleRate = 16_000;

  get isSpeaking(): boolean {
    return this.speaking || this.onsetMs > 0;
  }

  reset() {
    this.chunks = [];
    this.onsetChunks = [];
    this.speaking = false;
    this.silenceMs = 0;
    this.speechMs = 0;
    this.onsetMs = 0;
    this.onsetSilenceMs = 0;
    this.energySum = 0;
    this.energyFrames = 0;
  }

  ingest(frame: Float32Array, sampleRate: number): ReadyUtterance[] {
    this.sampleRate = sampleRate;
    const energy = rms(frame);
    const frameMs = (frame.length / sampleRate) * 1000;
    const out: ReadyUtterance[] = [];

    if (energy >= SPEECH_RMS) {
      const avgRms = this.energyFrames > 0 ? this.energySum / this.energyFrames : 0;
      const weakPrefix = this.speaking && isLikelySilence({ avgRms, speechMs: this.speechMs });
      const gapSplit = this.speaking && this.silenceMs >= GAP_SPLIT_MS;
      const weakToLoud =
        weakPrefix && this.silenceMs >= 160 && energy >= Math.max(SPEECH_RMS * 2, avgRms * 1.8);
      if (gapSplit || weakToLoud) {
        const prev = this.takeSegment(sampleRate);
        if (prev) out.push(prev);
      }
      this.pushSpeech(frame, energy, frameMs);
      if (this.speaking && this.speechMs >= MAX_UTTERANCE_S * 1000) {
        const full = this.takeSegment(sampleRate);
        if (full) out.push(full);
      }
      return out;
    }

    if (!this.speaking) {
      if (this.onsetMs > 0) {
        this.onsetSilenceMs += frameMs;
        if (this.onsetSilenceMs >= 80) this.resetOnset();
      }
      return out;
    }

    if (this.silenceMs < SILENCE_PAD_MS) this.chunks.push(frame);
    this.silenceMs += frameMs;
    if (this.silenceMs >= SILENCE_MS) {
      const done = this.takeSegment(sampleRate);
      if (done) out.push(done);
    }
    return out;
  }

  forceFlush(): ReadyUtterance | null {
    return this.takeSegment(this.sampleRate);
  }

  private pushSpeech(frame: Float32Array, energy: number, frameMs: number) {
    if (!this.speaking) {
      this.onsetChunks.push(frame);
      this.onsetMs += frameMs;
      this.onsetSilenceMs = 0;
      this.energySum += energy;
      this.energyFrames += 1;
      if (this.onsetMs < MIN_ONSET_MS) return;
      this.speaking = true;
      this.chunks = this.onsetChunks;
      this.onsetChunks = [];
      this.speechMs = this.onsetMs;
      this.onsetMs = 0;
      this.silenceMs = 0;
      return;
    }
    this.silenceMs = 0;
    this.speechMs += frameMs;
    this.energySum += energy;
    this.energyFrames += 1;
    this.chunks.push(frame);
  }

  private resetOnset() {
    this.onsetChunks = [];
    this.onsetMs = 0;
    this.onsetSilenceMs = 0;
    this.energySum = 0;
    this.energyFrames = 0;
  }

  private takeSegment(sampleRate: number): ReadyUtterance | null {
    const chunks = this.speaking ? this.chunks : [];
    const speechMs = this.speechMs;
    const avgRms = this.energyFrames > 0 ? this.energySum / this.energyFrames : 0;
    this.reset();
    if (chunks.length === 0) return null;
    return {
      samples: takeConcat(chunks),
      sampleRate,
      speechMs,
      avgRms,
      listening: true,
    };
  }
}

export interface DecodeQueue {
  submit(utterance: ReadyUtterance): boolean;
  get busy(): boolean;
  idle(): Promise<void>;
}

/**
 * Capture-friendly decode gate: never drops a newer segment while Whisper is busy.
 * Silence-like jobs are skipped when real speech is already queued, and ignored if superseded.
 */
export function createDecodeQueue(opts: {
  transcribe: (samples: Float32Array, sampleRate: number) => Promise<string>;
  onText: (text: string, utterance: ReadyUtterance) => void;
  onBusy?: (busy: boolean) => void;
}): DecodeQueue {
  const pending: ReadyUtterance[] = [];
  let draining = false;
  let drainScheduled = false;
  let inFlight: ReadyUtterance | null = null;
  let idleWait: (() => void) | null = null;

  const isIdle = () => !draining && !drainScheduled && pending.length === 0 && !inFlight;

  const signalIdle = () => {
    if (isIdle()) {
      idleWait?.();
      idleWait = null;
    }
  };

  const scheduleDrain = () => {
    if (draining || drainScheduled) return;
    drainScheduled = true;
    queueMicrotask(() => {
      drainScheduled = false;
      void drain();
    });
  };

  const drain = async () => {
    if (draining) return;
    draining = true;
    opts.onBusy?.(true);
    try {
      while (pending.length) {
        const job = pending.shift()!;
        if (shouldSkipDecode(job)) continue;
        if (isLikelySilence(job) && pending.some((p) => !isLikelySilence(p))) continue;
        inFlight = job;
        let raw = '';
        try {
          raw = await opts.transcribe(job.samples, job.sampleRate);
        } catch {
          raw = '';
        }
        inFlight = null;
        if (job.stale) continue;
        const text = cleanTranscript(raw);
        if (text) opts.onText(text, job);
      }
    } finally {
      draining = false;
      if (pending.length) {
        void drain();
      } else {
        opts.onBusy?.(false);
        signalIdle();
      }
    }
  };

  return {
    submit(utterance: ReadyUtterance): boolean {
      if (shouldSkipDecode(utterance)) return false;
      if (inFlight && isLikelySilence(inFlight) && !isLikelySilence(utterance)) {
        inFlight.stale = true;
      }
      pending.push(utterance);
      if (!draining) scheduleDrain();
      return true;
    },
    get busy() {
      return draining || drainScheduled || pending.length > 0;
    },
    idle() {
      if (isIdle()) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const prev = idleWait;
        idleWait = () => {
          prev?.();
          resolve();
        };
      });
    },
  };
}
