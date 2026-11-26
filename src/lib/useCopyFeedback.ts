import { useCallback, useState } from 'react';
import { useAutoDismiss } from './useAutoDismiss';

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
