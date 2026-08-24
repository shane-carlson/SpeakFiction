import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { ensureLocalStt, transcribePcm } from '../core/localStt';
import {
  NAME_VOICE_TAKES,
  nameVoiceTrainingComplete,
  persistNameVoiceClip,
  playNameVoiceClips,
} from '../core/nameVoiceClips';
import { whisperPrompt } from '../core/whisperPrompt';
import type { NameVoiceClip } from '../core/types';
import { recordOnePcmUtterance } from '../hooks/pcmCapture';
import { MicIcon } from './MicIcon';

export function NameVoiceTrainer({
  canonical,
  clips,
  onClipsChange,
  required,
}: {
  canonical: string;
  clips: NameVoiceClip[];
  onClipsChange: (clips: NameVoiceClip[]) => void;
  required: boolean;
}) {
  const audioSettings = useStore((s) => s.audioSettings);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const clipsRef = useRef(clips);
  clipsRef.current = clips;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const name = canonical.trim();
  const ready = nameVoiceTrainingComplete(clips);
  const takeNumber = Math.min(clips.length + 1, NAME_VOICE_TAKES);

  const prompt = !name
    ? 'Type the canonical spelling first, then say it twice.'
    : recording
      ? clips.length === 0
        ? `Say “${name}”. Pause, then we will ask for it again.`
        : `Say “${name}” again.`
      : ready
        ? `Voice clip saved (${clips.length} take${clips.length === 1 ? '' : 's'}). Dictating “New Character” also saves this clip.`
        : required
          ? clips.length === 0
            ? `Say “${name}” twice — two short recordings.`
            : `Say “${name}” one more time (${clips.length} of ${NAME_VOICE_TAKES}).`
          : `Record “${name}” twice so later mishearings can be rewritten.`;

  const stopRecording = () => {
    abortRef.current?.abort('flush');
  };

  const recordTake = async () => {
    if (!name) {
      setError('Type the name before recording.');
      return;
    }
    setError(null);
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    setRecording(true);
    try {
      await ensureLocalStt();
      let misses = 0;
      let collected = [...clipsRef.current];
      while (!nameVoiceTrainingComplete(collected)) {
        const utt = await recordOnePcmUtterance(audioSettings, {
          onLevel: setLevel,
          signal: ac.signal,
        });
        const heard = await transcribePcm(utt.samples, utt.sampleRate, {
          prompt: whisperPrompt([name]),
          allowQuiet: true,
        });
        if (!heard.trim()) {
          misses += 1;
          setError(`Did not catch “${name}”. Say it again.`);
          if (misses >= 2 || ac.signal.aborted) break;
          continue;
        }
        misses = 0;
        const clip = await persistNameVoiceClip(utt.samples, utt.sampleRate, {
          heard,
          source: 'library',
        });
        collected = [...collected, clip];
        onClipsChange(collected);
        if (nameVoiceTrainingComplete(collected) || ac.signal.aborted) break;
      }
    } catch (e) {
      if (ac.signal.aborted && ac.signal.reason !== 'flush') return;
      const message = e instanceof Error ? e.message : 'Could not record the name.';
      if (!/stopped/i.test(message)) setError(message);
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setRecording(false);
      setBusy(false);
      setLevel(0);
    }
  };

  const play = async () => {
    if (!clips.length || playing) return;
    setPlaying(true);
    setError(null);
    try {
      await playNameVoiceClips(clips);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not play the voice clip.');
    } finally {
      setPlaying(false);
    }
  };

  return (
    <div className="name-voice-trainer">
      <label>Voice clip</label>
      <p className="sub" style={{ marginTop: 0 }}>
        {prompt}
      </p>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className={`btn ${recording ? 'danger' : 'ghost'} compact name-voice-record`}
          onClick={() => (recording ? stopRecording() : void recordTake())}
          disabled={busy && !recording}
        >
          <MicIcon />
          {recording ? 'Stop' : ready ? 'Record another' : clips.length ? `Record take ${takeNumber}` : 'Record name twice'}
        </button>
        <button type="button" className="btn ghost compact" onClick={() => void play()} disabled={!clips.length || playing || recording}>
          {playing ? 'Playing…' : clips.length > 1 ? 'Play clips' : 'Play clip'}
        </button>
        {recording && (
          <span className="name-voice-level" aria-hidden="true">
            <span style={{ width: `${Math.max(8, level)}%` }} />
          </span>
        )}
        {ready && <span className="badge other">Trained</span>}
      </div>
      {error && <p className="sub name-voice-error">{error}</p>}
    </div>
  );
}
