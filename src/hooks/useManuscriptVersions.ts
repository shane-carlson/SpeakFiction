import { useCallback, useEffect, useState } from 'react';
import type { Block } from '../core/types';
import type { RecoveryPoint, RecoveryPointMeta } from '../core/manuscriptVersions';
import { manuscriptVersionRecorder } from '../core/manuscriptVersionsLive';

export function useManuscriptVersions(bookId: string, currentBlocks: Block[]) {
  const [points, setPoints] = useState<RecoveryPointMeta[]>([]);
  const [preview, setPreview] = useState<RecoveryPoint | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const recorder = manuscriptVersionRecorder();
    await recorder.flush(bookId, currentBlocks);
    await recorder.ensureBaseline(bookId, currentBlocks);
    const next = await recorder.list(bookId);
    setPoints(next);
    return next;
  }, [bookId, currentBlocks]);

  useEffect(() => {
    let cancelled = false;
    const recorder = manuscriptVersionRecorder();
    void recorder.ensureBaseline(bookId, currentBlocks).then(async () => {
      const next = await recorder.list(bookId);
      if (!cancelled) setPoints(next);
    });
    return recorder.subscribe((id) => {
      if (id !== bookId) return;
      void recorder.list(bookId).then((next) => {
        if (!cancelled) setPoints(next);
      });
    });
    // Baseline once per book; later edits notify via subscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  const openPreview = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const point = await manuscriptVersionRecorder().load(bookId, id);
        setPreview(point);
      } finally {
        setLoading(false);
      }
    },
    [bookId],
  );

  return { points, preview, loading, refresh, openPreview, setPreview };
}
