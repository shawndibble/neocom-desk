/**
 * Puts the page's scroll back when Back (or Forward) returns to an entry.
 *
 * The browser restores scroll itself, but only at `popstate`: a page that
 * remounts behind a spinner (the PI Plan tab, back from a Map drawer) is short
 * at that moment, so the restore clamps to 0. This remembers each history
 * entry's scroll and, on a POP, waits for the page to be tall enough again.
 * It gives up after `POP_RESTORE_GIVE_UP_MS`, or as soon as the pilot scrolls,
 * types or taps, so nobody is yanked away from where they already went.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

export const POP_RESTORE_GIVE_UP_MS = 3000;

/** Scroll per history entry (`location.key`); lives for the tab, like history itself. */
const savedScroll = new Map<string, number>();

const INPUT_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

export function usePopScrollRestore(): void {
  const location = useLocation();
  const navigationType = useNavigationType();

  // Key and target set at commit: a clamp scroll fired after the next page commits is filed
  // under the new key, and the target is read before that scroll can zero it.
  const keyRef = useRef(location.key);
  const targetRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    keyRef.current = location.key;
    const y = navigationType === 'POP' ? savedScroll.get(location.key) : undefined;
    targetRef.current = y !== undefined && y > 0 ? y : null;
  }, [location.key, navigationType]);

  useEffect(() => {
    const save = () => savedScroll.set(keyRef.current, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, []);

  useEffect(() => {
    const y = targetRef.current;
    if (y === null) return;
    const startedAt = Date.now();
    let frame = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      for (const type of INPUT_EVENTS) window.removeEventListener(type, stop);
    };
    const tick = () => {
      const room = document.documentElement.scrollHeight - window.innerHeight;
      if (room >= y) {
        stop();
        window.scrollTo(0, y);
        return;
      }
      if (Date.now() - startedAt > POP_RESTORE_GIVE_UP_MS) {
        stop();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    for (const type of INPUT_EVENTS) window.addEventListener(type, stop, { passive: true });
    tick();
    return stop;
  }, [location.key, navigationType]);
}
