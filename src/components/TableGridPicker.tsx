import { useLayoutEffect, useRef, useState } from 'react';
import { TABLE_MAX_COLS, TABLE_MAX_ROWS, TABLE_MIN_COLS, TABLE_MIN_ROWS } from '../core/manuscript';

export function TableGridPicker({
  x,
  y,
  onSelect,
  onClose,
}: {
  x: number;
  y: number;
  onSelect: (rows: number, cols: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState({ rows: TABLE_MIN_ROWS, cols: TABLE_MIN_COLS });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - rect.width - 8);
    }
    if (top + rect.height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - rect.height - 8);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y]);

  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    const onPointer = (e: Event) => {
      const el = ref.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('contextmenu', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('contextmenu', onPointer, true);
    };
  }, [onClose]);

  const cells: JSX.Element[] = [];
  for (let r = 1; r <= TABLE_MAX_ROWS; r++) {
    for (let c = 1; c <= TABLE_MAX_COLS; c++) {
      const rows = Math.max(TABLE_MIN_ROWS, r);
      const cols = Math.max(TABLE_MIN_COLS, c);
      const on = r <= hover.rows && c <= hover.cols;
      cells.push(
        <button
          key={`${r}-${c}`}
          type="button"
          className={on ? 'ms-table-picker-cell is-on' : 'ms-table-picker-cell'}
          aria-label={`${rows} by ${cols} table`}
          onMouseEnter={() => setHover({ rows, cols })}
          onClick={() => onSelect(rows, cols)}
        />,
      );
    }
  }

  return (
    <div ref={ref} className="ms-table-picker card" role="dialog" aria-label="Insert table" style={{ left: x, top: y }}>
      <div
        className="ms-table-picker-grid"
        style={{ gridTemplateColumns: `repeat(${TABLE_MAX_COLS}, 14px)` }}
        onMouseLeave={() => setHover({ rows: TABLE_MIN_ROWS, cols: TABLE_MIN_COLS })}
      >
        {cells}
      </div>
      <div className="ms-table-picker-label">
        {hover.rows} × {hover.cols}
      </div>
    </div>
  );
}
