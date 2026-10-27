import { useCallback, useState } from 'react';
import { useAutoDismiss } from './useAutoDismiss';

/**
 * A "Copied" flash: `flash(value)` shows `value` in `copied`, then clears it
 * to `null` after `ms`. A new flash replaces the value and restarts the timer;
 * unmount cancels it. `T` defaults to `true` (plain flag, `flash()`); pass a
 * key or status when the flash must say *which* control copied.
 */
export function useCopyFeedback<T = true>(
  ms: number
): { copied: T | null; flash: (value?: T) => void; clear: () => void } {
  const [copied, setCopied] = useState<T | null>(null);
  const { show, cancel } = useAutoDismiss<T | null>(setCopied, null, ms);

  const flash = useCallback((value: T = true as T) => show(value), [show]);
  const clear = useCallback(() => {
    cancel();
    setCopied(null);
  }, [cancel]);

  return { copied, flash, clear };
}
