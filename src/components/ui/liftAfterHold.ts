import { useRef, type MouseEvent, type PointerEvent } from 'react';

/**
 * How long a touch has to be held before it is the context menu's long-press
 * rather than a tap. Radix opens a context menu at 700ms (its default).
 */
export const CONTEXT_MENU_HOLD_MS = 700;

export interface PressRecord {
  /** `PointerEvent.timeStamp` of the press. */
  start: number;
  /** A finger or pen, not a mouse. */
  touch: boolean;
  /** A `contextmenu` event fired during the press: the hold became a menu. */
  menu: boolean;
}

/**
 * Whether the click that follows a press is only the finger lifting off a
 * hold: the press became a context menu, or a touch was held past the menu's
 * delay. Some browsers still send a click on lift, which would open the row
 * (or its Show info) on top of the menu the hold just opened. A mouse click
 * is never swallowed for its length — a slow click is still a click.
 */
export function isLiftAfterHold(
  press: PressRecord | null,
  clickTimeStamp: number,
  holdMs: number = CONTEXT_MENU_HOLD_MS
): boolean {
  if (!press) return false;
  return press.menu || (press.touch && clickTimeStamp - press.start >= holdMs);
}

/**
 * Spread `handlers` onto the element that is both clickable and wrapped in a
 * context menu, and ask `swallowClick(event)` first thing in its click
 * handler; it also clears the record, so the next ordinary tap opens as usual.
 */
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
    },
    swallowClick(event: MouseEvent): boolean {
      const p = press.current;
      press.current = null;
      return isLiftAfterHold(p, event.timeStamp, holdMs);
    },
  };
}
