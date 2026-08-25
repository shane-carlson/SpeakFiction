import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { resampleMono, rms } from './resample';
import { MIN_DECODE_RMS } from './speechUtterance';
import { cleanTranscript } from './transcriptCleanup';
import { hardwareFromNavigator, pickSttProfile, type SttProfile } from './sttProfile';

export const STT_SAMPLE_RATE = 16_000;
export { MIN_DECODE_RMS };

/** fp32: q8 MatMulNBits graphs fail to load in Electron's onnxruntime-web. */
const STT_DTYPE = 'fp32' as const;
const NATIVE_TIMEOUT_MS = 45_000;
const IMPORT_TIMEOUT_MS = 120_000;

let pipelinePromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
let loadedWasmModel: string | null = null;
let queue: Promise<unknown> = Promise.resolve();
let cachedProfile: SttProfile | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

export type SttProgress = (percent: number) => void;

function nativeBridge() {
  return window.speakfiction?.stt;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    promise.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function resolveProfile(): Promise<SttProfile> {
  const bridge = nativeBridge();
  if (bridge) {
    try {
      cachedProfile = await bridge.getProfile();
      return cachedProfile;
    } catch {
      /* fall through */
    }
  }
  if (cachedProfile) return cachedProfile;
  cachedProfile = pickSttProfile(hardwareFromNavigator(), false);
  return cachedProfile;
}

export function currentSttProfile(): SttProfile | null {
  return cachedProfile;
}

/** Drop cached q8 Whisper graphs that fail to create an ORT session. */
async function dropBrokenQ8Cache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const names = await caches.keys();
  await Promise.all(
    names.map(async (name) => {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      await Promise.all(
        keys
          .filter((req) => /whisper-(tiny|base|small|medium)/i.test(req.url) && /q8|quantized/i.test(req.url))
          .map((req) => cache.delete(req)),
      );
    }),
  );
}

function applyWasmRuntime(profile: SttProfile) {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.allowRemoteModels = true;
  try {
    const onnx = env.backends.onnx as { wasm?: { numThreads?: number } };
    if (!onnx.wasm) onnx.wasm = {};
    onnx.wasm.numThreads = Math.max(1, profile.threads);
  } catch {
    /* onnx runtime env shape varies by version */
  }
}

function scheduleUnload(profile: SttProfile) {
  if (idleTimer) clearTimeout(idleTimer);
  if (profile.keepResident || !profile.idleUnloadMs) return;
  idleTimer = setTimeout(() => {
    void releaseLocalStt(false);
  }, profile.idleUnloadMs);
}

/** Drop WASM weights and ask native whisper-cli to quit so Library can use the RAM. */
export async function releaseLocalStt(native = true): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  pipelinePromise = null;
  loadedWasmModel = null;
  if (native) {
    try {
      await nativeBridge()?.unload?.();
    } catch {
      /* sidecar may already be idle */
    }
  }
}

async function ensureWasm(profile: SttProfile, onProgress?: SttProgress): Promise<AutomaticSpeechRecognitionPipeline> {
  if (pipelinePromise && loadedWasmModel === profile.modelId) return pipelinePromise;
  pipelinePromise = (async () => {
    applyWasmRuntime(profile);
    await dropBrokenQ8Cache();
    const asr = await pipeline('automatic-speech-recognition', profile.modelId, {
      dtype: STT_DTYPE,
      device: 'wasm',
      progress_callback: (info) => {
        const progress = (info as { progress?: number }).progress;
        if (typeof progress === 'number') {
          onProgress?.(progress <= 1 ? progress * 100 : progress);
        }
      },
    });
    loadedWasmModel = profile.modelId;
    onProgress?.(100);
    return asr;
  })().catch((err) => {
    pipelinePromise = null;
    loadedWasmModel = null;
    throw err;
  });
  return pipelinePromise;
}

export async function ensureLocalStt(onProgress?: SttProgress): Promise<SttProfile> {
  onProgress?.(1);
  const bridge = nativeBridge();
  if (bridge) {
    const stopProgress = onProgress ? bridge.onProgress?.(onProgress) : undefined;
    try {
      cachedProfile = await bridge.ensure();
      if (cachedProfile.runtime !== 'wasm') {
        onProgress?.(100);
        return cachedProfile;
      }
    } catch (err) {
      cachedProfile = pickSttProfile(hardwareFromNavigator(), false);
      console.warn('Native STT ensure failed, using WASM', err);
    } finally {
      stopProgress?.();
    }
  } else {
    cachedProfile = pickSttProfile(hardwareFromNavigator(), false);
  }
  await ensureWasm(cachedProfile, onProgress);
  return cachedProfile;
}

async function transcribeWasm(audio: Float32Array, profile: SttProfile, prompt?: string): Promise<string> {
  const asr = await ensureWasm(profile);
  const run = async () => {
    const result = await asr(audio, {
      return_timestamps: false,
      ...(prompt ? { initial_prompt: prompt } : {}),
    });
    const text = (Array.isArray(result) ? result[0]?.text : result.text)?.trim() ?? '';
    return cleanTranscript(text);
  };
  const next = queue.then(run, run);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  const text = await next;
  scheduleUnload(profile);
  return text;
}

export async function transcribePcm(
  samples: Float32Array,
  sampleRate: number,
  opts: { allowQuiet?: boolean; timeoutMs?: number; prompt?: string } = {},
): Promise<string> {
  if (samples.length === 0) return '';
  if (!opts.allowQuiet) {
    if (samples.length < sampleRate * 0.12) return '';
    if (rms(samples) < MIN_DECODE_RMS) return '';
  }
  const audio = resampleMono(samples, sampleRate, STT_SAMPLE_RATE);
  const profile = await resolveProfile();
  const bridge = nativeBridge();
  const timeoutMs = opts.timeoutMs ?? (opts.allowQuiet ? IMPORT_TIMEOUT_MS : NATIVE_TIMEOUT_MS);
  if (bridge && profile.runtime !== 'wasm') {
    try {
      const text = await withTimeout(
        bridge.transcribe(Array.from(audio), STT_SAMPLE_RATE, opts.prompt),
        timeoutMs,
        'Native Whisper',
      );
      scheduleUnload(profile);
      return cleanTranscript(text);
    } catch (err) {
      console.warn('Native Whisper failed, falling back to WASM', err);
      const wasmProfile = pickSttProfile(profile.hardware, false);
      cachedProfile = wasmProfile;
      return transcribeWasm(audio, wasmProfile, opts.prompt);
    }
  }
  return transcribeWasm(
    audio,
    profile.runtime === 'wasm' ? profile : pickSttProfile(profile.hardware, false),
    opts.prompt,
  );
}

/** File import: decode every chunk. Do not drop quiet or short slices. */
export async function transcribeImportedPcm(
  samples: Float32Array,
  sampleRate: number,
  prompt?: string,
): Promise<string> {
  return transcribePcm(samples, sampleRate, { allowQuiet: true, prompt });
}
