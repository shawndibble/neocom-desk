import { useEffect, useRef } from 'react';

export function useRetryFocus<T extends HTMLElement = HTMLDivElement>(
  read: 'busy' | 'failed' | 'ok',
  resetKey: unknown
) {
  const ref = useRef<T>(null);
  const armed = useRef(false);
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
  const hold = () => {
    armed.current = true;
    ref.current?.focus({ preventScroll: true });
  };
  return [ref, arm, hold] as const;
}
