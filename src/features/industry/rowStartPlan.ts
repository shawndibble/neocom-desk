import { useCallback, useRef, type MouseEvent } from 'react';

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
 * A row's click runs the same start-plan handler as its Start plan button, but
 * has no busy state of its own: this drops a second click while the first is
 * still saving the plan (a second plan), and re-arms when nothing opened.
 */
export function useRowStartPlan<T>(start: (target: T) => Promise<boolean>): (target: T) => void {
  const busy = useRef(false);
  return useCallback(
    (target: T) => {
      if (busy.current) return;
      busy.current = true;
      start(target).then(
        (navigated) => {
          if (!navigated) busy.current = false;
        },
        () => {
          busy.current = false;
        }
      );
    },
    [start]
  );
}
