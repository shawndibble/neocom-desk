import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Long enough to read as a change of view, short enough never to hold up reading it. */
const FADE_MS = 140;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

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
 * No `animate` (jsdom, an old browser): an instant swap. Reduced motion is
 * read as the fade would start, not subscribed to: it only matters then.
 */
export function useFadeOnChange(target: RefObject<HTMLElement | null>, key: string): void {
  const running = useRef<Animation | null>(null);
  const shownKey = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (shownKey.current === key) return;
    shownKey.current = key;
    const node = target.current;
    if (node === null || typeof node.animate !== 'function') return;
    if (window.matchMedia?.(REDUCED_MOTION_QUERY).matches) return;
    // Changing again mid-fade would otherwise leave two animations driving
    // the same property, and the abandoned one still holds its own opacity.
    running.current?.cancel();
    running.current = node.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: FADE_MS,
      easing: 'ease-out',
    });
  }, [target, key]);
}
