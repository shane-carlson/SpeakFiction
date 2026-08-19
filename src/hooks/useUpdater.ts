import { useCallback, useEffect, useState } from 'react';
import { IDLE_UPDATE_STATUS, type UpdateStatus } from '../core/update';

function updaterBridge() {
  return window.speakfiction?.updater;
}

export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>(IDLE_UPDATE_STATUS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bridge = updaterBridge();
    if (!bridge) {
      setStatus(IDLE_UPDATE_STATUS);
      return;
    }
    void bridge.getStatus().then(setStatus).catch(() => {
      setStatus(IDLE_UPDATE_STATUS);
    });
    return bridge.onStatus(setStatus);
  }, []);

  const check = useCallback(async () => {
    const bridge = updaterBridge();
    if (!bridge) return;
    setBusy(true);
    setError(null);
    try {
      const next = await bridge.check();
      setStatus(next);
      if (next.state === 'error') setError(next.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check for updates.');
    } finally {
      setBusy(false);
    }
  }, []);

  const install = useCallback(async () => {
    const bridge = updaterBridge();
    if (!bridge) return { ok: false as const, error: 'Updates are only available in the SpeakFiction app.' };
    setBusy(true);
    setError(null);
    try {
      const result = await bridge.install();
      if (!result.ok) setError(result.error || 'Could not install the update.');
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not install the update.';
      setError(message);
      return { ok: false as const, error: message };
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, error, check, install };
}
