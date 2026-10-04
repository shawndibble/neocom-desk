import { useEffect, useRef } from 'react';

/** A toast that offers an action (Undo, Open, Appraise) — long enough to reach it. */
export const TOAST_MS = 8000;
/** A short status note beside a control ("Copied"). */
export const NOTICE_MS = 2500;
/** A one-line status that reports what the last load did. */
export const MESSAGE_MS = 6000;

/**
 * Expire a transient toast: once `value` is non-null, call `onExpire` after
 * `durationMs`. A new `value` (by identity) restarts the timer, and unmount
 * or an early clear to null cancels it. The caller keeps its own state (a
 * `useState`, or a reducer for the Materials edit session) and passes the
 * thing that clears it as `onExpire`, so `<Toast>` call sites stay as they
 * were — this only owns the "show, wait, clear, cancel" half.
 */
export function useTimedToast<T>(
  value: T | null | undefined,
  onExpire: () => void,
  durationMs: number = TOAST_MS
): void {
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  const showing = value !== null && value !== undefined;
  useEffect(() => {
    if (!showing) return;
    const timer = setTimeout(() => onExpireRef.current(), durationMs);
    return () => clearTimeout(timer);
  }, [value, showing, durationMs]);
}
