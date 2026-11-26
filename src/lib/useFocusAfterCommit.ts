import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export type FocusCandidate =
  | HTMLElement
  | RefObject<HTMLElement | null>
  | (() => HTMLElement | null | undefined)
  | null
  | undefined;

const REQUEST_TTL_MS = 1000;

function resolve(candidate: FocusCandidate): HTMLElement | null {
  if (!candidate) return null;
  try {
    if (typeof candidate === 'function') return candidate() ?? null;
    if (candidate instanceof HTMLElement) return candidate;
    return candidate.current;
  } catch {
    return null;
  }
}

export function firstConnected(candidates: readonly FocusCandidate[]): HTMLElement | null {
  for (const candidate of candidates) {
    const el = resolve(candidate);
    if (el?.isConnected) return el;
  }
  return null;
}

export function useFocusAfterCommit(options?: {
  preventScroll?: boolean;
}): (...candidates: FocusCandidate[]) => void {
  const preventScroll = options?.preventScroll ?? false;
  const [, setTick] = useState(0);
  const pending = useRef<readonly FocusCandidate[] | null>(null);
  const cancel = useRef<(() => void) | null>(null);

  const drop = useCallback(() => {
    pending.current = null;
    cancel.current?.();
    cancel.current = null;
  }, []);

  const attempt = useCallback(() => {
    const candidates = pending.current;
    if (!candidates) return;
    const el = firstConnected(candidates);
    if (!el) return;
    drop();
    try {
      if (!el.hasAttribute('tabindex') && !el.matches('a[href],button,input,select,textarea')) {
        el.tabIndex = -1;
      }
      if (preventScroll) el.focus({ preventScroll: true });
      else el.focus();
    } catch {}
  }, [drop, preventScroll]);

  useLayoutEffect(() => {
    attempt();
  });

  useEffect(() => drop, [drop]);

  return useCallback(
    (...candidates: FocusCandidate[]) => {
      drop();
      pending.current = candidates;
      const timer = window.setTimeout(drop, REQUEST_TTL_MS);
      document.addEventListener('focusin', drop);
      cancel.current = () => {
        window.clearTimeout(timer);
        document.removeEventListener('focusin', drop);
      };
      setTick((n) => n + 1);
    },
    [drop]
  );
}
