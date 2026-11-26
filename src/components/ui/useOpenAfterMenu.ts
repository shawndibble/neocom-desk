import { useCallback, useEffect, useRef } from 'react';

interface Pending {
  fn: () => void;
  keepFocus: boolean;
}

export function useOpenAfterMenu(onCloseAutoFocus?: (event: Event) => void) {
  const pending = useRef<Pending | null>(null);
  const callerRef = useRef(onCloseAutoFocus);
  useEffect(() => {
    callerRef.current = onCloseAutoFocus;
  });

  const run = useCallback((fn: () => void, options: { keepFocus?: boolean } = {}) => {
    pending.current = { fn, keepFocus: options.keepFocus ?? false };
  }, []);

  const handleCloseAutoFocus = useCallback((event: Event) => {
    const next = pending.current;
    pending.current = null;
    if (next?.keepFocus) event.preventDefault();
    callerRef.current?.(event);
    next?.fn();
  }, []);

  return { run, onCloseAutoFocus: handleCloseAutoFocus };
}
