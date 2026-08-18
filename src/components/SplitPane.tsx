import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

const DEFAULT_MIN = 0.28;
const DEFAULT_MAX = 0.72;

export function SplitPane({
  left,
  right,
  ratio,
  onRatioChange,
  minRatio = DEFAULT_MIN,
  maxRatio = DEFAULT_MAX,
  'aria-label': ariaLabel = 'Resize dictation and manuscript',
}: {
  left: ReactNode;
  right: ReactNode;
  ratio: number;
  onRatioChange: (ratio: number) => void;
  minRatio?: number;
  maxRatio?: number;
  'aria-label'?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef(ratio);
  const [live, setLive] = useState<number | null>(null);
  const value = live ?? ratio;
  const pct = Math.round(value * 1000) / 10;

  const clamp = useCallback(
    (next: number, width: number) => {
      const fromPx = width > 0 ? 240 / width : minRatio;
      const lo = Math.min(0.5, Math.max(minRatio, fromPx));
      const hi = Math.max(0.5, Math.min(maxRatio, 1 - fromPx));
      if (lo > hi) return 0.5;
      return Math.min(hi, Math.max(lo, next));
    },
    [maxRatio, minRatio],
  );

  const applyClientX = useCallback(
    (clientX: number) => {
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const next = clamp((clientX - rect.left) / rect.width, rect.width);
      liveRef.current = next;
      setLive(next);
    },
    [clamp],
  );

  const stopDrag = () => {
    document.body.classList.remove('is-resizing');
    onRatioChange(liveRef.current);
    setLive(null);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.classList.add('is-resizing');
    liveRef.current = value;
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    applyClientX(e.clientX);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    stopDrag();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.08 : 0.03;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onRatioChange(clamp(ratio - step, wrapRef.current?.getBoundingClientRect().width ?? 0));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onRatioChange(clamp(ratio + step, wrapRef.current?.getBoundingClientRect().width ?? 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onRatioChange(minRatio);
    } else if (e.key === 'End') {
      e.preventDefault();
      onRatioChange(maxRatio);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onRatioChange(0.5);
    }
  };

  return (
    <div className="split-pane" ref={wrapRef}>
      <div className="split-pane-side" style={{ flex: `0 0 ${pct}%` }}>
        {left}
      </div>
      <div
        className="split-pane-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label={ariaLabel}
        aria-valuemin={Math.round(minRatio * 100)}
        aria-valuemax={Math.round(maxRatio * 100)}
        aria-valuenow={Math.round(value * 100)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => onRatioChange(0.5)}
        onKeyDown={onKeyDown}
      />
      <div className="split-pane-side split-pane-side-fill">{right}</div>
    </div>
  );
}
