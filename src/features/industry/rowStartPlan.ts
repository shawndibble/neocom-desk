import { useCallback, type MouseEvent } from 'react';

const CONTROL =
  'a[href],button,input,select,textarea,label,summary,[role="button"],[role="checkbox"],[role="link"],[role="menuitem"],[role="switch"],[data-row-control]';

export function isCardOwnClick(event: MouseEvent<HTMLElement>): boolean {
  const card = event.currentTarget;
  const target = event.target;
  if (!(target instanceof Element) || !card.contains(target)) return false;
  const control = target.closest(CONTROL);
  return control === null || control === card || !card.contains(control);
}

const inFlight = new Set<unknown>();

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
