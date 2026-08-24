import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeVoiceNotes, type VoiceNote, type VoiceNoteStatus } from '../core/voiceNotes';

function notesBridge() {
  return window.speakfiction?.notes;
}

export function useVoiceNotes() {
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [paired, setPaired] = useState(false);
  const [displayKey, setDisplayKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = useRef<Partial<Record<string, VoiceNoteStatus>>>({});
  const localRef = useRef<VoiceNote[]>([]);

  const apply = useCallback((payload: { notes?: VoiceNote[]; paired?: boolean; displayKey?: string | null }) => {
    if (Array.isArray(payload.notes)) {
      const next = mergeVoiceNotes(payload.notes, localRef.current, pending.current);
      localRef.current = next;
      setNotes(next);
    }
    if (typeof payload.paired === 'boolean') setPaired(payload.paired);
    if (payload.displayKey !== undefined) setDisplayKey(payload.displayKey);
  }, []);

  const refresh = useCallback(async (opts?: { quiet?: boolean }) => {
    const bridge = notesBridge();
    setError(null);
    if (!opts?.quiet) setBusy(true);
    try {
      if (!bridge) {
        setNotes([]);
        setPaired(false);
        return;
      }
      const status = await bridge.getStatus();
      apply(status);
      const listed = await bridge.list();
      apply(listed);
      const remote = await bridge.refresh();
      apply(remote);
      if (!remote.ok && remote.message) setError(remote.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load voice notes.');
    } finally {
      if (!opts?.quiet) setBusy(false);
    }
  }, [apply]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      void refresh({ quiet: true });
    }, 8000);
    const onFocus = () => {
      void refresh({ quiet: true });
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const addLocal = useCallback(
    async (note: VoiceNote) => {
      const bridge = notesBridge();
      if (!bridge) {
        setNotes((prev) => [note, ...prev.filter((n) => n.id !== note.id)]);
        return;
      }
      const next = await bridge.addLocal(note);
      apply(next);
    },
    [apply],
  );

  const setStatus = useCallback(
    async (
      id: string,
      status: VoiceNoteStatus,
      extra?: Partial<Pick<VoiceNote, 'text' | 'hasAudio' | 'durationMs'>>,
    ) => {
      pending.current[id] = status;
      const optimistic = mergeVoiceNotes(
        [],
        localRef.current.map((note) => (note.id === id ? { ...note, ...extra, status } : note)),
        pending.current,
      );
      localRef.current = optimistic;
      setNotes(optimistic);
      const bridge = notesBridge();
      if (!bridge) {
        delete pending.current[id];
        return;
      }
      try {
        const next = await bridge.setStatus(id, status, extra);
        apply(next);
      } finally {
        delete pending.current[id];
      }
    },
    [apply],
  );

  return { notes, paired, displayKey, busy, error, refresh, addLocal, setStatus };
}
