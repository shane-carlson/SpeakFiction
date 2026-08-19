import { concatFloat32, rms } from './resample';
import { cleanTranscript } from './transcriptCleanup';

/** Frame energy that counts as voice activity. Quiet speech still counts. */
export const SPEECH_RMS = 0.006;
/**
 * Skip Whisper only on near-digital-silence.
 * Prefer a filler false positive over dropping real words or spoken cues.
 */
export const MIN_DECODE_RMS = 0.003;
/** Commit after this much trailing silence. */
export const SILENCE_MS = 1100;
/** Keep a pad so word endings are not clipped; do not send a full silence tail to Whisper. */
export const SILENCE_PAD_MS = 280;
/** Ignore clicks/pops that never become sustained speech. */
export const MIN_ONSET_MS = 60;
/** Brief dip during onset (e.g. between “new” and “chapter”) must not wipe the first word. */
export const ONSET_SILENCE_MS = 250;
/** Typical sentence length. Never use as a commit/skip gate — short cues must land. */
export const MIN_SPEECH_S = 0.7;
/** Skip only sub-syllable clicks before Whisper. Cues like “new paragraph” are longer than this. */
export const MIN_COMMAND_S = 0.12;
export const MAX_UTTERANCE_S = 12;

export interface ReadyUtterance {
  samples: Float32Array;
  sampleRate: number;
  speechMs: number;
  avgRms: number;
  listening: boolean;
}

export function shouldSkipDecode(u: Pick<ReadyUtterance, 'avgRms' | 'speechMs'>): boolean {
  return u.speechMs < MIN_COMMAND_S * 1000 || u.avgRms < MIN_DECODE_RMS;
}

/** Any cleaned transcript that arrived while listening belongs in the box. */
export function shouldCommitDecoded(
  text: string,
  utt: Pick<ReadyUtterance, 'listening'>,
): boolean {
  return Boolean(utt.listening && text.trim());
}

function takeConcat(chunks: Float32Array[]): Float32Array {
  return concatFloat32(chunks);
}

/**
 * Voice-activity slicer: one mic pipeline, many utterances.
 * Capture is never blocked by an in-flight Whisper job.
 * Does not split on short pauses — that threw away “new chapter” + the title that followed.
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
      this.pushSpeech(frame, energy, frameMs);
      if (this.speaking && this.speechMs >= MAX_UTTERANCE_S * 1000) {
        const full = this.takeSegment(sampleRate);
        if (full) out.push(full);
      }
      return out;
    }

    if (!this.speaking) {
      if (this.onsetMs > 0) {
        this.onsetChunks.push(frame);
        this.onsetSilenceMs += frameMs;
        if (this.onsetSilenceMs >= ONSET_SILENCE_MS) this.resetOnset();
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
 * In-flight jobs are never marked stale. Quiet/short-but-real speech is decoded;
 * `cleanTranscript` drops only pure filler loops after Whisper returns.
 */
export function createDecodeQueue(opts: {
  transcribe: (samples: Float32Array, sampleRate: number) => Promise<string>;
  onText: (text: string, utterance: ReadyUtterance) => void;
  onBusy?: (busy: boolean) => void;
}): DecodeQueue {
  const pending: ReadyUtterance[] = [];
  let draining = false;
  let drainScheduled = false;
  let idleWait: (() => void) | null = null;

  const isIdle = () => !draining && !drainScheduled && pending.length === 0;

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
        let raw = '';
        try {
          raw = await opts.transcribe(job.samples, job.sampleRate);
        } catch {
          raw = '';
        }
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
