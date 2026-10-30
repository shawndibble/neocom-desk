import { useLayoutEffect, useRef, type RefObject } from 'react';
import { usePrefersReducedMotion } from './useMediaQuery';

/** Long enough to read as a change of view, short enough never to hold up reading it. */
const FADE_MS = 140;

/**
 * Fades `target` in whenever `key` changes: the route outlet on a page change
 * (`Layout`), a tab panel on a tab switch (`useTabPanelProps`). Opacity only
 * (DESIGN.md §6b); nothing under reduced motion.
 *
 * Runs the animation on the live element rather than replaying a CSS one,
 * because the only way to restart a CSS animation is to remount — and the
 * element must keep its instance (the outlet keeps its route's state across a
 * pathname change; a panel keeps its tab's). `useLayoutEffect`, so the first
 * frame of the new view is already at opacity 0; an effect after paint would
 * flash the content in at full opacity and then fade it.
 *
 * `onFirstRender: false` skips the mount, for an element that appears with a
 * view already fading in around it (a tab panel arrives with its page).
 *
 * The `animate` guard is a real capability check, not a test shim: jsdom
 * implements no Web Animations API, so this must degrade to an instant swap
 * exactly as it does in a browser that lacks it.
 */
export function useFadeOnChange(
  target: RefObject<HTMLElement | null>,
  key: string,
  { onFirstRender = true }: { onFirstRender?: boolean } = {}
): void {
  const running = useRef<Animation | null>(null);
  const seen = useRef(false);
  const reduced = usePrefersReducedMotion();

  useLayoutEffect(() => {
    const first = !seen.current;
    seen.current = true;
    if (first && !onFirstRender) return;
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
  }, [target, key, reduced, onFirstRender]);
}
