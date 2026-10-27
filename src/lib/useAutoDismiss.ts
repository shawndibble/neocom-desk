import { useCallback, useEffect, useRef } from 'react';

/**
 * "Show a beside-the-button confirmation, then clear it after a delay" —
 * the shape `PlanEditor.tsx` used to hand-write at seven call sites
 * (copy/import/optimize/promote/marker/reorder confirms), each its own
 * `setValue(x); setTimeout(() => setValue(off), ms)`. Only the import path
 * (#1402) also cleared a *pending* timer before starting a new one — so a
 * second click within the delay on any of the other six raced: the first
 * timer could still fire and clear a confirmation the second click just
 * set — and only import ever needed to cancel early (its Undo action).
 * This hook does the superseding and the unmount cleanup for every caller,
 * and `cancel` covers import's early-cancel case too, so all seven can
 * share one implementation. Callers keep their own `useState`/
 * `useScopedState` (or any other `(value: T) => void` setter) untouched.
 * `offValue` is the "nothing to show" value the state clears back to —
 * `false` for a boolean flag, `null` for a message.
 */
export function useAutoDismiss<T>(
  setValue: (value: T) => void,
  offValue: T,
  defaultDurationMs = 2000
): { show: (value: T, durationMs?: number) => void; cancel: () => void } {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  const show = useCallback(
    (value: T, durationMs: number = defaultDurationMs) => {
      cancel();
      setValue(value);
      timeoutRef.current = setTimeout(() => setValue(offValue), durationMs);
    },
    [cancel, setValue, offValue, defaultDurationMs]
  );

  return { show, cancel };
}
