import { useRef, type MouseEvent, type PointerEvent } from 'react';

export const CONTEXT_MENU_HOLD_MS = 700;

export interface PressRecord {
  start: number;
  touch: boolean;
  menu: boolean;
}

export function isLiftAfterHold(
  press: PressRecord | null,
  clickTimeStamp: number,
  holdMs: number = CONTEXT_MENU_HOLD_MS
): boolean {
  if (!press) return false;
  return press.menu || (press.touch && clickTimeStamp - press.start >= holdMs);
}

export function useLiftAfterHoldGuard(holdMs: number = CONTEXT_MENU_HOLD_MS) {
  const press = useRef<PressRecord | null>(null);
  return {
    handlers: {
      onPointerDown(event: PointerEvent) {
        press.current = {
          start: event.timeStamp,
          touch: event.pointerType !== 'mouse',
          menu: false,
        };
      },
      onContextMenu() {
        if (press.current) press.current.menu = true;
      },
      onPointerCancel() {
        press.current = null;
      },
      onKeyDown() {
        press.current = null;
      },
    },
    swallowClick(event: MouseEvent): boolean {
      const p = press.current;
      press.current = null;
      if (event.detail === 0) return false;
      return isLiftAfterHold(p, event.timeStamp, holdMs);
    },
  };
}
