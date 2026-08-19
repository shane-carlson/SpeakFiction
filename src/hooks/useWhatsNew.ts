import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useStore } from '../store';
import { hasPersistedSession } from '../core/sessionStorage';
import {
  appVersionId,
  bundledWhatsNew,
  pendingNotesIndicateUpdate,
  resolveWhatsNewNotes,
  shouldRecordLastSeenOnLaunch,
  shouldShowWhatsNew,
  type PendingWhatsNew,
} from '../core/whatsNew';

function runningVersionId() {
  return appVersionId(__APP_VERSION__, __APP_BUILD__);
}

function usePersistHydrated() {
  const [hydrated, setHydrated] = useState(() => useStore.persist.hasHydrated());
  useEffect(() => {
    const persist = useStore.persist;
    if (persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}

export function useWhatsNew() {
  const lastSeenVersion = useStore((s) => s.lastSeenVersion);
  const setLastSeenVersion = useStore((s) => s.setLastSeenVersion);
  const currentVersion = runningVersionId();
  const hydrated = usePersistHydrated();
  const priorSession = hasPersistedSession();
  const [pending, setPending] = useState<PendingWhatsNew | null | undefined>(undefined);
  const [notes, setNotes] = useState(() => bundledWhatsNew(__APP_VERSION__));

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void (async () => {
      let next: PendingWhatsNew | null = null;
      try {
        next = (await window.speakfiction?.whatsNew?.getPending?.()) ?? null;
      } catch {
        next = null;
      }
      if (!cancelled) setPending(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  const pendingReady = pending !== undefined;
  const hasPendingNotes = pendingNotesIndicateUpdate(pending);
  const canDecideWithoutPending = Boolean(lastSeenVersion) || priorSession;
  const ready = hydrated && (pendingReady || canDecideWithoutPending);
  const context = { hasPriorSession: priorSession, hasPendingNotes };
  const show = ready && shouldShowWhatsNew(lastSeenVersion, currentVersion, context);

  useLayoutEffect(() => {
    if (!ready) return;
    if (
      !shouldRecordLastSeenOnLaunch(lastSeenVersion, currentVersion, {
        hasPriorSession: priorSession,
        hasPendingNotes,
      })
    ) {
      return;
    }
    setLastSeenVersion(currentVersion);
  }, [
    ready,
    lastSeenVersion,
    currentVersion,
    priorSession,
    hasPendingNotes,
    setLastSeenVersion,
  ]);

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    void (async () => {
      const resolved = await resolveWhatsNewNotes({
        version: __APP_VERSION__,
        build: __APP_BUILD__,
        pending: pending ?? null,
      });
      if (!cancelled) setNotes(resolved.text);
    })();
    return () => {
      cancelled = true;
    };
  }, [show, pending]);

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
