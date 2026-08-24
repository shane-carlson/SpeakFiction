import { openMicrophone } from './useLocalAudio';
import type { AudioSettings } from '../core/audioSettings';
import { rms } from '../core/resample';
import { UtteranceSlicer, type ReadyUtterance } from '../core/speechUtterance';

export type PcmFrameHandler = (frame: Float32Array, sampleRate: number) => void;

export interface PcmCapture {
  stop: () => Promise<void>;
  getLevel: () => number;
}

/** Open the mic and stream mono float frames until stop(). */
export async function startPcmCapture(settings: AudioSettings, onFrame: PcmFrameHandler): Promise<PcmCapture> {
  const stream = await openMicrophone(settings);
  const audioCtx = new AudioContext();
  await audioCtx.resume();
  if (audioCtx.state !== 'running') {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('Could not start audio capture. Click Record after allowing the microphone.');
  }

  const source = audioCtx.createMediaStreamSource(stream);
  const mute = audioCtx.createGain();
  mute.gain.value = 0;
  let lastRms = 0;
  let processor: AudioWorkletNode | ScriptProcessorNode | null = null;

  const handle = (frame: Float32Array, sampleRate: number) => {
    lastRms = rms(frame);
    onFrame(frame, sampleRate);
  };

  try {
    const worklet = `
      class SpeakFictionCapture extends AudioWorkletProcessor {
        process(inputs) {
          const ch = inputs[0] && inputs[0][0];
          if (ch && ch.length) this.port.postMessage(new Float32Array(ch));
          return true;
        }
      }
      registerProcessor('sf-capture', SpeakFictionCapture);
    `;
    const blob = new Blob([worklet], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    await audioCtx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(audioCtx, 'sf-capture');
    node.port.onmessage = (event) => {
      const data = event.data;
      if (data instanceof Float32Array) handle(data, audioCtx.sampleRate);
    };
    source.connect(node);
    node.connect(mute);
    processor = node;
  } catch {
    const node = audioCtx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (event) => {
      handle(new Float32Array(event.inputBuffer.getChannelData(0)), audioCtx.sampleRate);
    };
    source.connect(node);
    node.connect(mute);
    processor = node;
  }

  mute.connect(audioCtx.destination);

  return {
    getLevel: () => lastRms,
    stop: async () => {
      try {
        processor?.disconnect();
      } catch {
        /* already closed */
      }
      processor = null;
      stream.getTracks().forEach((t) => t.stop());
      if (audioCtx.state !== 'closed') await audioCtx.close();
    },
  };
}

/**
 * Record until the slicer emits one utterance (trailing silence) or the signal aborts.
 * Abort with reason `"flush"` to keep whatever speech was captured.
 */
export async function recordOnePcmUtterance(
  settings: AudioSettings,
  opts: { onLevel?: (n: number) => void; signal?: AbortSignal } = {},
): Promise<ReadyUtterance> {
  const slicer = new UtteranceSlicer();
  let settled = false;
  let meter = 0;
  let resolve!: (utt: ReadyUtterance) => void;
  let reject!: (err: Error) => void;
  const done = new Promise<ReadyUtterance>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const finish = (utt: ReadyUtterance | null, err?: Error) => {
    if (settled) return;
    settled = true;
    if (utt) resolve(utt);
    else reject(err ?? new Error('Did not catch the name. Say it again.'));
  };

  const capture = await startPcmCapture(settings, (frame, sampleRate) => {
    if (settled) return;
    const segs = slicer.ingest(frame, sampleRate);
    opts.onLevel?.(Math.min(100, rms(frame) * 900));
    if (segs[0]) finish(segs[0]);
  });

  const onAbort = () => {
    const flushed = slicer.forceFlush();
    if (opts.signal?.reason === 'flush') finish(flushed);
    else finish(null, new Error('Recording stopped.'));
  };
  if (opts.signal?.aborted) onAbort();
  else opts.signal?.addEventListener('abort', onAbort, { once: true });

  meter = window.setInterval(() => {
    opts.onLevel?.(Math.min(100, capture.getLevel() * 900));
  }, 80);

  try {
    const utt = await done;
    return utt;
  } finally {
    window.clearInterval(meter);
    opts.signal?.removeEventListener('abort', onAbort);
    await capture.stop();
  }
}
