import { useEffect, useRef } from 'react';

export const TOAST_MS = 8000;
export const NOTICE_MS = 2500;
export const MESSAGE_MS = 6000;

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
