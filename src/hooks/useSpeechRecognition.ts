import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioSettings } from '../store';
import { openMicrophone } from './useLocalAudio';
import { concatFloat32, rms } from '../core/resample';
import { ensureLocalStt, transcribePcm, MIN_DECODE_RMS } from '../core/localStt';
import { parseVoiceCommand } from '../core/voiceCommands';
import type { SttProfile } from '../core/sttProfile';

export type DictationSession = 'stopped' | 'listening' | 'paused';

export interface UseSpeechRecognition {
  supported: boolean;
  session: DictationSession;
  listening: boolean;
  transcribing: boolean;
  modelProgress: number | null;
  profileLabel: string | null;
  interim: string;
  error: string | null;
  level: number;
  start: () => Promise<void>;
  pause: () => void;
  stop: () => void;
}

const SPEECH_RMS = 0.012;
const SILENCE_MS = 1100;
const MIN_SPEECH_S = 0.7;
const MIN_COMMAND_S = 0.3;
const MAX_UTTERANCE_S = 12;

function startMeter(getLevel: () => number, onLevel: (n: number) => void): () => void {
  let raf = 0;
  const tick = () => {
    onLevel(Math.min(100, getLevel() * 900));
    raf = requestAnimationFrame(tick);
  };
  tick();
  return () => cancelAnimationFrame(raf);
}

function settingsKey(s: AudioSettings): string {
  return `${s.inputDeviceId}|${s.echoCancellation}|${s.noiseSuppression}|${s.autoGainControl}`;
}

export function useSpeechRecognition(
  onFinal: (text: string) => void,
  audioSettings: AudioSettings,
  onProfile?: (profile: SttProfile) => void,
  options?: { mayDictate?: boolean },
): UseSpeechRecognition {
  const [supported] = useState(() => Boolean(navigator.mediaDevices?.getUserMedia));
  const [session, setSession] = useState<DictationSession>('stopped');
  const [transcribing, setTranscribing] = useState(false);
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [profileLabel, setProfileLabel] = useState<string | null>(null);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);

  const sessionRef = useRef<DictationSession>('stopped');
  sessionRef.current = session;
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const onProfileRef = useRef(onProfile);
  onProfileRef.current = onProfile;
  const audioSettingsRef = useRef(audioSettings);
  audioSettingsRef.current = audioSettings;
  const mayDictate = options?.mayDictate !== false;
  const mayDictateRef = useRef(mayDictate);
  mayDictateRef.current = mayDictate;
  const mountedRef = useRef(true);
  const captureKeyRef = useRef<string | null>(null);
  const framesRef = useRef(0);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | AudioWorkletNode | null>(null);
  const meterRef = useRef<(() => void) | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const speakingRef = useRef(false);
  const silenceMsRef = useRef(0);
  const speechMsRef = useRef(0);
  const lastRmsRef = useRef(0);
  const energySumRef = useRef(0);
  const energyFramesRef = useRef(0);
  const flushingRef = useRef(false);
  const flushRef = useRef<(force?: boolean) => Promise<void>>(async () => undefined);

  const resetUtterance = () => {
    chunksRef.current = [];
    speakingRef.current = false;
    silenceMsRef.current = 0;
    speechMsRef.current = 0;
    energySumRef.current = 0;
    energyFramesRef.current = 0;
  };

  const teardownCapture = useCallback(() => {
    meterRef.current?.();
    meterRef.current = null;
    processorRef.current?.disconnect();
    processorRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    captureKeyRef.current = null;
    resetUtterance();
    lastRmsRef.current = 0;
    flushingRef.current = false;
    framesRef.current = 0;
    setLevel(0);
  }, []);

  const applyCommand = useCallback((command: 'start' | 'pause' | 'stop') => {
    if (command === 'start') {
      if (!mayDictateRef.current) return;
      sessionRef.current = 'listening';
      setSession('listening');
      return;
    }
    if (command === 'pause') {
      sessionRef.current = 'paused';
      setSession('paused');
      return;
    }
    sessionRef.current = 'stopped';
    setSession('stopped');
  }, []);

  const ingestFrame = useCallback((frame: Float32Array, sampleRate: number) => {
    if (!mountedRef.current || sessionRef.current === 'stopped') return;
    framesRef.current += 1;
    const energy = rms(frame);
    lastRmsRef.current = energy;
    const frameMs = (frame.length / sampleRate) * 1000;

    if (energy >= SPEECH_RMS) {
      speakingRef.current = true;
      silenceMsRef.current = 0;
      speechMsRef.current += frameMs;
      energySumRef.current += energy;
      energyFramesRef.current += 1;
      chunksRef.current.push(frame);
      if (sessionRef.current === 'listening') {
        setInterim((prev) => (prev === '' ? '…' : prev));
      }
      if (speechMsRef.current >= MAX_UTTERANCE_S * 1000) {
        void flushRef.current(true);
      }
    } else if (speakingRef.current) {
      chunksRef.current.push(frame);
      silenceMsRef.current += frameMs;
      if (silenceMsRef.current >= SILENCE_MS) {
        void flushRef.current(false);
      }
    }
  }, []);

  const flushUtterance = useCallback(async () => {
    const ctx = ctxRef.current;
    const chunks = chunksRef.current;
    if (!ctx || chunks.length === 0 || flushingRef.current) return;
    const samples = concatFloat32(chunks);
    const seconds = samples.length / ctx.sampleRate;
    const avgRms = energyFramesRef.current > 0 ? energySumRef.current / energyFramesRef.current : 0;
    const listeningBefore = sessionRef.current === 'listening';
    resetUtterance();
    if (seconds < MIN_COMMAND_S || avgRms < MIN_DECODE_RMS) {
      setInterim('');
      return;
    }
    flushingRef.current = true;
    setTranscribing(true);
    try {
      const raw = await transcribePcm(samples, ctx.sampleRate);
      const parsed = parseVoiceCommand(raw);
      if (parsed.command === 'stop') {
        applyCommand('stop');
        teardownCapture();
      } else if (parsed.command) {
        applyCommand(parsed.command);
      }
      const prose = parsed.remainder.trim();
      if (prose && listeningBefore && (parsed.command || seconds >= MIN_SPEECH_S)) {
        onFinalRef.current(prose);
      }
      setInterim('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transcription failed.');
    } finally {
      flushingRef.current = false;
      setTranscribing(false);
    }
  }, [applyCommand, teardownCapture]);
  flushRef.current = flushUtterance;

  const ensureCapture = useCallback(
    async (forceRestart = false) => {
      const key = settingsKey(audioSettingsRef.current);
      const ctx = ctxRef.current;
      const live = streamRef.current?.getAudioTracks().some((t) => t.readyState === 'live');
      if (!forceRestart && live && ctx && ctx.state === 'running' && captureKeyRef.current === key) {
        await ctx.resume();
        return;
      }

      teardownCapture();
      const stream = await openMicrophone(audioSettingsRef.current);
      const audioCtx = new AudioContext();
      await audioCtx.resume();
      if (audioCtx.state !== 'running') {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error('Could not start audio capture. Click the mic again after allowing the microphone.');
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const mute = audioCtx.createGain();
      mute.gain.value = 0;
      let connected = false;

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
          if (data instanceof Float32Array) ingestFrame(data, audioCtx.sampleRate);
        };
        source.connect(node);
        node.connect(mute);
        processorRef.current = node;
        connected = true;
      } catch {
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (event) => {
          ingestFrame(new Float32Array(event.inputBuffer.getChannelData(0)), audioCtx.sampleRate);
        };
        source.connect(processor);
        processor.connect(mute);
        processorRef.current = processor;
        connected = true;
      }

      if (!connected) {
        stream.getTracks().forEach((t) => t.stop());
        await audioCtx.close();
        throw new Error('This environment cannot capture microphone PCM.');
      }

      mute.connect(audioCtx.destination);
      streamRef.current = stream;
      ctxRef.current = audioCtx;
      captureKeyRef.current = key;
      framesRef.current = 0;
      meterRef.current = startMeter(() => lastRmsRef.current, setLevel);

      window.setTimeout(() => {
        if (!mountedRef.current || sessionRef.current === 'stopped') return;
        if (framesRef.current < 4) {
          setError('Microphone opened but no audio frames arrived. Check the input device and try Start again.');
        }
      }, 1800);
    },
    [ingestFrame, teardownCapture],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (!mayDictate) {
      setModelProgress(null);
      return () => {
        mountedRef.current = false;
        teardownCapture();
      };
    }
    void (async () => {
      try {
        setModelProgress(1);
        const profile = await ensureLocalStt((percent) => setModelProgress(Math.max(1, percent)));
        if (!mountedRef.current) return;
        setProfileLabel(profile.label);
        onProfileRef.current?.(profile);
      } catch (e) {
        if (!mountedRef.current) return;
        setError(e instanceof Error ? e.message : 'Could not load the on-device speech model.');
      }
    })();
    return () => {
      mountedRef.current = false;
      teardownCapture();
    };
  }, [mayDictate, teardownCapture]);

  useEffect(() => {
    if (session === 'stopped') return;
    const key = settingsKey(audioSettings);
    if (captureKeyRef.current && captureKeyRef.current !== key) {
      void ensureCapture(true).catch((e) => {
        setError(e instanceof Error ? e.message : 'Could not apply audio settings.');
      });
    }
  }, [
    audioSettings,
    audioSettings.autoGainControl,
    audioSettings.echoCancellation,
    audioSettings.inputDeviceId,
    audioSettings.noiseSuppression,
    ensureCapture,
    session,
  ]);

  useEffect(() => {
    if (mayDictate) return;
    if (sessionRef.current === 'stopped') return;
    void flushRef.current().finally(() => {
      teardownCapture();
      sessionRef.current = 'stopped';
      setSession('stopped');
      setInterim('');
    });
  }, [mayDictate, teardownCapture]);

  const start = useCallback(async () => {
    if (!mayDictateRef.current) {
      setError('Your trial has ended. Buy a license to dictate.');
      return;
    }
    setError(null);
    setInterim('');
    try {
      setModelProgress((p) => (p != null && p < 100 ? p : 1));
      const profile = await ensureLocalStt((percent) => setModelProgress(Math.max(1, percent)));
      setProfileLabel(profile.label);
      onProfileRef.current?.(profile);
      await ensureCapture(false);
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== 'running') await ctx.resume();
      if (!ctxRef.current || ctxRef.current.state !== 'running') {
        await ensureCapture(true);
      }
      sessionRef.current = 'listening';
      setSession('listening');
    } catch (e) {
      sessionRef.current = 'stopped';
      setSession('stopped');
      teardownCapture();
      setError(e instanceof Error ? e.message : 'Could not start the microphone.');
    }
  }, [ensureCapture, teardownCapture]);

  const pause = useCallback(() => {
    void flushRef.current();
    sessionRef.current = 'paused';
    setSession('paused');
    setInterim('');
  }, []);

  const stop = useCallback(() => {
    void flushRef.current().finally(() => {
      teardownCapture();
      sessionRef.current = 'stopped';
      setSession('stopped');
      setInterim('');
    });
  }, [teardownCapture]);

  return {
    supported,
    session,
    listening: session === 'listening',
    transcribing,
    modelProgress,
    profileLabel,
    interim,
    error,
    level,
    start,
    pause,
    stop,
  };
}
