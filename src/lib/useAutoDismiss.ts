import { useCallback, useEffect, useRef } from 'react';

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
