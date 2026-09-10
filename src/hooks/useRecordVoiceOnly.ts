import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioSettings } from '../core/audioSettings';
import { encodePcmWav, NAME_VOICE_MIME } from '../core/pcmWav';
import { createRecordVoiceOnlyNote, type VoiceNote } from '../core/voiceNotes';
import { recordPcmUntilStop } from './pcmCapture';

export function useRecordVoiceOnly() {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const recordingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const start = useCallback(
    async (opts: {
      book: { id: string; title: string };
      audioSettings: AudioSettings;
      mayDictate: boolean;
      writeAudio?: (
        id: string,
        payload: { mime: string; bytes: Uint8Array | number[] },
      ) => Promise<{ ok: boolean; message?: string }>;
      addLocal?: (note: VoiceNote) => Promise<unknown>;
    }): Promise<{ ok: true } | { ok: false; message: string }> => {
      if (!opts.mayDictate) {
        return { ok: false, message: 'A license is required to record a voice-only take.' };
      }
      if (recordingRef.current) {
        return { ok: false, message: 'Already recording a voice-only take.' };
      }
      const ac = new AbortController();
      abortRef.current = ac;
      recordingRef.current = true;
      setRecording(true);
      setElapsedMs(0);
      setLevel(0);
      const started = Date.now();
      const tick = window.setInterval(() => setElapsedMs(Date.now() - started), 200);
      try {
        const take = await recordPcmUntilStop(opts.audioSettings, {
          onLevel: setLevel,
          signal: ac.signal,
        });
        if (take.durationMs < 500 || take.samples.length === 0) {
          return { ok: false, message: 'That take was too short. Hold record, speak, then stop.' };
        }
        const wav = encodePcmWav(take.samples, take.sampleRate);
        const note = createRecordVoiceOnlyNote(
          opts.book,
          take.durationMs,
          window.speakfiction?.platform || 'desktop',
        );
        const write =
          opts.writeAudio ??
          (async (id, payload) => {
            const bridge = window.speakfiction?.notes;
            if (!bridge?.writeAudio) {
              return { ok: false as const, message: 'Voice notes audio is only saved in the desktop app.' };
            }
            return bridge.writeAudio(id, payload);
          });
        const saved = await write(note.id, { mime: NAME_VOICE_MIME, bytes: wav });
        if (!saved.ok) {
          return { ok: false, message: saved.message || 'Could not save that recording on this computer.' };
        }
        const add =
          opts.addLocal ??
          (async (next) => {
            await window.speakfiction?.notes?.addLocal(next);
          });
        await add(note);
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : 'Could not record that take.' };
      } finally {
        window.clearInterval(tick);
        if (abortRef.current === ac) abortRef.current = null;
        recordingRef.current = false;
        setRecording(false);
        setElapsedMs(0);
        setLevel(0);
      }
    },
    [],
  );

  return { recording, elapsedMs, level, start, stop };
}
