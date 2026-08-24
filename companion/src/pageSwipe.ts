import { useMemo, useRef } from 'react';
import { PanResponder, type GestureResponderHandlers } from 'react-native';

const MIN_DX = 64;

export function useHorizontalSwipe({
  onSwipeLeft,
  onSwipeRight,
  onGrant,
  enabled = true,
  capture = true,
  axis = 'horizontal',
}: {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onGrant?: () => void;
  enabled?: boolean;
  capture?: boolean;
  /** Limit which way the page swipe may claim the gesture. */
  axis?: 'horizontal' | 'left' | 'right';
}): GestureResponderHandlers {
  const left = useRef(onSwipeLeft);
  const right = useRef(onSwipeRight);
  const grant = useRef(onGrant);
  const on = useRef(enabled);
  const steal = useRef(capture);
  const dir = useRef(axis);
  left.current = onSwipeLeft;
  right.current = onSwipeRight;
  grant.current = onGrant;
  on.current = enabled;
  steal.current = capture;
  dir.current = axis;

  const allowed = (dx: number) => {
    if (dir.current === 'right') return dx > 0;
    if (dir.current === 'left') return dx < 0;
    return true;
  };

  return useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, gesture) => {
          if (!on.current || !allowed(gesture.dx)) return false;
          const ax = Math.abs(gesture.dx);
          const ay = Math.abs(gesture.dy);
          return ax > 18 && ax > ay * 1.5;
        },
        onMoveShouldSetPanResponderCapture: (_e, gesture) => {
          if (!on.current || !steal.current || !allowed(gesture.dx)) return false;
          const ax = Math.abs(gesture.dx);
          const ay = Math.abs(gesture.dy);
          return ax > 28 && ax > ay * 1.8;
        },
        onPanResponderGrant: () => {
          grant.current?.();
        },
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_e, gesture) => {
          if (gesture.dx > MIN_DX) right.current?.();
          else if (gesture.dx < -MIN_DX) left.current?.();
        },
        onPanResponderTerminate: (_e, gesture) => {
          if (gesture.dx > MIN_DX) right.current?.();
          else if (gesture.dx < -MIN_DX) left.current?.();
        },
      }).panHandlers,
    [],
  );
}
