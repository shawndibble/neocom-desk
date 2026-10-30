import { useLayoutEffect, useRef, type RefObject } from 'react';
import { usePrefersReducedMotion } from './useMediaQuery';

/** Long enough to read as a change of view, short enough never to hold up reading it. */
const FADE_MS = 140;

/**
 * Fades `target` in as it mounts and whenever `key` changes: the route outlet
 * on a page change (`Layout`), a tab panel on a tab switch
 * (`useTabPanelProps`). Opacity only (DESIGN.md §6b); nothing under reduced
 * motion.
 *
 * Runs the animation on the live element rather than replaying a CSS one,
 * because the only way to restart a CSS animation is to remount — and the
 * element must keep its instance (the outlet keeps its route's state across a
 * pathname change; a panel keeps its tab's). `useLayoutEffect`, so the first
 * frame of the new view is already at opacity 0; an effect after paint would
 * flash the content in at full opacity and then fade it.
 *
 * The `animate` guard is a real capability check, not a test shim: jsdom
 * implements no Web Animations API, so this must degrade to an instant swap
 * exactly as it does in a browser that lacks it.
 */
export function useFadeOnChange(target: RefObject<HTMLElement | null>, key: string): void {
  const running = useRef<Animation | null>(null);
  const shownKey = useRef<string | null>(null);
  const reduced = usePrefersReducedMotion();

  useLayoutEffect(() => {
    // Keyed on what is shown, not on every run: turning reduced motion off
    // must not fade a view that has not changed.
    if (shownKey.current === key) return;
    shownKey.current = key;
    const node = target.current;
    if (node === null || typeof node.animate !== 'function') return;
    if (reduced) return;
    // Changing again mid-fade would otherwise leave two animations driving
    // the same property, and the abandoned one still holds its own opacity.
    running.current?.cancel();
    running.current = node.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: FADE_MS,
      easing: 'ease-out',
    });
  }, [target, key, reduced]);
}
