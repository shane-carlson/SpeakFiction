import { useLayoutEffect, useRef } from 'react';

export interface AppContextMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  group: string;
}

export function AppContextMenu({
  x,
  y,
  items,
  onClose,
  onSelect,
}: {
  x: number;
  y: number;
  items: AppContextMenuItem[];
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

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
  }, [x, y, items]);

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

  const groups: AppContextMenuItem[][] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last[0].group === item.group) last.push(item);
    else groups.push([item]);
  }

  return (
    <div
      ref={ref}
      className="sf-context-menu card"
      role="menu"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {groups.map((group, gi) => (
        <div key={group[0].group + gi} className="sf-context-menu-group" role="group">
          {group.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="btn ghost compact"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                onSelect(item.id);
                onClose();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
