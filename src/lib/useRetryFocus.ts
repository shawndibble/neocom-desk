import { useEffect, useRef } from 'react';

/**
 * Where keyboard focus goes after "ESI didn't answer" → Retry (WCAG 2.4.3).
 * Returns `[ref, arm]`: put `ref` on a `tabIndex={-1}` wrapper around the result
 * (any element; pass `<section>` etc. as `T`) and call `arm` from Retry.
 *
 * - Read succeeds (`'ok'`): focus moves to the wrapper, never to `<body>`.
 * - Read fails again: a Retry that is still mounted keeps focus where it sits
 *   (PI: Retry is a sibling outside the wrapper). If Retry unmounted while
 *   loading, focus fell to `<body>`, so the wrapper takes it.
 *
 * The wrapper must be mounted in whichever state the read settles in (PI has it
 * only in the ok state, which is enough there). A `resetKey` change (another
 * character) drops a pending retry.
 */
export function useRetryFocus<T extends HTMLElement = HTMLDivElement>(
  read: 'busy' | 'failed' | 'ok',
  resetKey: unknown
) {
  const ref = useRef<T>(null);
  const armed = useRef(false);
  // A switch (another character) drops a pending retry: its focus is not wanted on the new read.
  useEffect(() => {
    armed.current = false;
  }, [resetKey]);
  useEffect(() => {
    if (!armed.current || read === 'busy') return;
    const el = ref.current;
    if (read === 'failed') {
      armed.current = false;
      const active = document.activeElement;
      if (el && (!active || active === document.body)) el.focus({ preventScroll: true });
    } else if (el) {
      armed.current = false;
      el.focus({ preventScroll: true });
    }
  }, [read]);
  const arm = () => {
    armed.current = true;
  };
  return [ref, arm] as const;
}
