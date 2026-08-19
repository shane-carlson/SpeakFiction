import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store';
import {
  appVersionId,
  bundledWhatsNew,
  resolveWhatsNewNotes,
  shouldShowWhatsNew,
} from '../core/whatsNew';

function runningVersionId() {
  return appVersionId(__APP_VERSION__, __APP_BUILD__);
}

export function useWhatsNew() {
  const lastSeenVersion = useStore((s) => s.lastSeenVersion);
  const setLastSeenVersion = useStore((s) => s.setLastSeenVersion);
  const currentVersion = runningVersionId();
  const show = shouldShowWhatsNew(lastSeenVersion, currentVersion);
  const [notes, setNotes] = useState(() => bundledWhatsNew(__APP_VERSION__));

  useEffect(() => {
    if (lastSeenVersion) return;
    if (!currentVersion) return;
    setLastSeenVersion(currentVersion);
  }, [lastSeenVersion, currentVersion, setLastSeenVersion]);

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    void (async () => {
      let pending = null;
      try {
        pending = (await window.speakfiction?.whatsNew?.getPending?.()) ?? null;
      } catch {
        pending = null;
      }
      const resolved = await resolveWhatsNewNotes({
        version: __APP_VERSION__,
        build: __APP_BUILD__,
        pending,
      });
      if (!cancelled) setNotes(resolved.text);
    })();
    return () => {
      cancelled = true;
    };
  }, [show]);

  const dismiss = useCallback(() => {
    if (currentVersion) setLastSeenVersion(currentVersion);
    void window.speakfiction?.whatsNew?.clearPending?.();
  }, [currentVersion, setLastSeenVersion]);

  return {
    open: show,
    notes,
    version: __APP_VERSION__,
    build: __APP_BUILD__,
    dismiss,
  };
}
