import { useEffect, useRef } from 'react';

/**
 * Where keyboard focus goes after "ESI didn't answer" → Retry. Retry stays
 * mounted (and focused) while the read runs and fails again; on success the
 * notice disappears, so focus moves to the result instead of dropping to
 * `<body>`. Returns `[ref, arm]`: put `ref` on a `tabIndex={-1}` wrapper around the result.
 */
export function useRetryFocus(read: 'busy' | 'failed' | 'ok') {
  const ref = useRef<HTMLDivElement>(null);
  const armed = useRef(false);
  useEffect(() => {
    if (!armed.current || read === 'busy') return;
    if (read === 'failed') {
      armed.current = false;
    } else if (ref.current) {
      armed.current = false;
      ref.current.focus();
    }
  }, [read]);
  const arm = () => {
    armed.current = true;
  };
  return [ref, arm] as const;
}
