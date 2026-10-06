import { useCallback, type MouseEvent } from 'react';

const CONTROL =
  'a[href],button,input,select,textarea,label,summary,[role="button"],[role="checkbox"],[role="link"],[role="menuitem"],[role="switch"],[data-row-control]';

/**
 * Whether a click on a hand-built phone card is the card's own: not on a
 * control inside it (checkbox, Start plan, history, menu) and not bubbled up
 * through React from a menu or modal portaled out of it. `DataTable` does the
 * same for its rows.
 */
export function isCardOwnClick(event: MouseEvent<HTMLElement>): boolean {
  const card = event.currentTarget;
  const target = event.target;
  if (!(target instanceof Element) || !card.contains(target)) return false;
  const control = target.closest(CONTROL);
  return control === null || control === card || !card.contains(control);
}

/**
 * Plans being created right now, by the key a caller names (the catalog entry
 * or row). One set for the row click and the Start plan button, so clicking
 * the button and then the row (or the reverse) can't save two plans. A start
 * stays claimed once it has navigated (the page unmounts); it is released when
 * nothing opened.
 */
const inFlight = new Set<unknown>();

/** Runs `start` unless the same `key` is already being started; resolves like `start`, false when dropped. */
export function startPlanOnce(key: unknown, start: () => Promise<boolean>): Promise<boolean> {
  if (inFlight.has(key)) return Promise.resolve(false);
  inFlight.add(key);
  return start().then(
    (navigated) => {
      if (!navigated) inFlight.delete(key);
      return navigated;
    },
    (error: unknown) => {
      inFlight.delete(key);
      throw error;
    }
  );
}

/**
 * A row's click runs the same start-plan handler as its Start plan button,
 * through the same in-flight guard (`startPlanOnce`): a second click while the
 * first is still saving the plan is dropped, and it re-arms when nothing
 * opened. `keyOf` names what is being planned (default: the target itself).
 */
export function useRowStartPlan<T>(
  start: (target: T) => Promise<boolean>,
  keyOf: (target: T) => unknown = (target) => target
): (target: T) => void {
  return useCallback(
    (target: T) => {
      startPlanOnce(keyOf(target), () => start(target)).catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [start]
  );
}
