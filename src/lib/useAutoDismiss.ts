import { useCallback, useEffect, useRef } from 'react';

/**
 * "Show a beside-the-button confirmation, then clear it after a delay" —
 * the shape `PlanEditor.tsx` used to hand-write at several call sites
 * (copy/optimize/promote/marker/reorder confirms), each its own
 * `setValue(x); setTimeout(() => setValue(off), ms)`. None of them cleared
 * a *pending* timer before starting a new one, so a second click within the
 * delay raced: the first timer could still fire and clear a confirmation
 * the second click just set. This hook does that superseding, and the
 * unmount cleanup none of them had, once — callers keep their own
 * `useState`/`useScopedState` (or any other `(value: T) => void` setter)
 * untouched. `offValue` is the "nothing to show" value the state clears
 * back to — `false` for a boolean flag, `null` for a message.
 */
export function useAutoDismiss<T>(
  setValue: (value: T) => void,
  offValue: T,
  defaultDurationMs = 2000
): (value: T, durationMs?: number) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    []
  );

  return useCallback(
    (value: T, durationMs: number = defaultDurationMs) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setValue(value);
      timeoutRef.current = setTimeout(() => setValue(offValue), durationMs);
    },
    [setValue, offValue, defaultDurationMs]
  );
}
