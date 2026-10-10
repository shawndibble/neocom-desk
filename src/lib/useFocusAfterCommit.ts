import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Something focus can land on: an element, a ref, or a getter for one that only exists after the update. */
export type FocusCandidate =
  | HTMLElement
  | RefObject<HTMLElement | null>
  | (() => HTMLElement | null | undefined)
  | null
  | undefined;

/** How long a request keeps retrying before it is dropped. */
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

/**
 * The first candidate that is currently connected to the document, resolving
 * getters and refs. Pure, so a dialog's `returnFocusFallback` can use it:
 * `returnFocusFallback={() => firstConnected(candidates)}`.
 */
export function firstConnected(candidates: readonly FocusCandidate[]): HTMLElement | null {
  for (const candidate of candidates) {
    const el = resolve(candidate);
    if (el?.isConnected) return el;
  }
  return null;
}

/**
 * Moves keyboard focus after an action removes the control that ran it
 * (WCAG 2.4.3). In a handler: `focusAfterCommit(nextRow, prevRow, heading)`.
 *
 * After the next commit (a layout effect) the first connected candidate gets
 * focus; a candidate that is not focusable by itself (a heading) gets
 * `tabIndex = -1` first, and the caller gives it `focus:outline-none`. When no
 * candidate is connected yet the request is kept and retried on every later
 * commit, until it succeeds, a `focusin` lands anywhere (the user moved on, or
 * a dialog restored focus itself), or about a second passes. A second call
 * replaces the first. Never throws.
 *
 * In a dialog flow request focus only after the dialog has closed. For targets
 * that appear after an async load, use `useRetryFocus` or `useFocusHeading`.
 */
export function useFocusAfterCommit(): (...candidates: FocusCandidate[]) => void {
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
    // Drop first: our own focus() fires `focusin`, which must not read as the user moving on.
    drop();
    try {
      if (!el.hasAttribute('tabindex') && !el.matches('a[href],button,input,select,textarea')) {
        el.tabIndex = -1;
      }
      el.focus();
    } catch {
      // Focus is best-effort; a throwing target must not break the handler.
    }
  }, [drop]);

  // No dependency list: every commit of the host is another chance for a late candidate.
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
      // Guarantees a commit even when the handler changes no state of its own.
      setTick((n) => n + 1);
    },
    [drop]
  );
}
