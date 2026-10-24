import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const GAP = 6;
const MARGIN = 8;

function tipAnchor(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest('[data-tooltip]');
  return el instanceof HTMLElement ? el : null;
}

function labelText(el: HTMLElement): string {
  return el.getAttribute('data-tooltip')?.trim() ?? '';
}

function canUse(el: HTMLElement): boolean {
  if (!labelText(el)) return false;
  if (el instanceof HTMLButtonElement && el.disabled) return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  return true;
}

/** Place the label beside the control and keep the whole label on screen. */
function placeLabel(anchor: DOMRect, label: DOMRect): { top: number; left: number } {
  let left = anchor.left + anchor.width / 2 - label.width / 2;
  if (left + label.width > window.innerWidth - MARGIN) left = window.innerWidth - MARGIN - label.width;
  if (left < MARGIN) left = MARGIN;

  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - label.height;
  const fitsBelow = below + label.height <= window.innerHeight - MARGIN;
  const top = fitsBelow || above < MARGIN ? below : above;
  return { top, left };
}

export function HoverLabel() {
  const labelRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const hide = useCallback(() => {
    anchorRef.current = null;
    setAnchor(null);
  }, []);

  const place = useCallback((el: HTMLElement) => {
    const label = labelRef.current;
    if (!label || !el.isConnected) return;
    const next = placeLabel(el.getBoundingClientRect(), label.getBoundingClientRect());
    label.style.top = `${next.top}px`;
    label.style.left = `${next.left}px`;
    label.style.visibility = 'visible';
  }, []);

  useLayoutEffect(() => {
    if (!anchor) return;
    place(anchor);
  }, [anchor, place]);

  useEffect(() => {
    const show = (el: HTMLElement) => {
      if (!canUse(el)) return;
      if (anchorRef.current === el) return;
      anchorRef.current = el;
      setAnchor(el);
    };
    const onOver = (event: PointerEvent) => {
      const el = tipAnchor(event.target);
      if (el) show(el);
    };
    const onOut = (event: PointerEvent) => {
      const el = tipAnchor(event.target);
      if (!el) return;
      if (tipAnchor(event.relatedTarget) === el) return;
      if (anchorRef.current !== el) return;
      hide();
    };
    const onFocus = (event: FocusEvent) => {
      const el = tipAnchor(event.target);
      if (el && el.matches(':focus-visible')) show(el);
    };
    const onBlur = (event: FocusEvent) => {
      const el = tipAnchor(event.target);
      if (!el) return;
      if (tipAnchor(event.relatedTarget) === el) return;
      if (el.matches(':hover')) return;
      if (anchorRef.current !== el) return;
      hide();
    };
    const onScroll = () => {
      const current = anchorRef.current;
      if (current) place(current);
    };

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onBlur);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [hide, place]);

  if (!anchor) return null;
  const text = labelText(anchor);
  if (!text) return null;
  return createPortal(
    <div
      ref={labelRef}
      className="hover-label"
      role="tooltip"
      style={{ top: 0, left: 0, visibility: 'hidden' }}
    >
      {text}
    </div>,
    document.body,
  );
}
