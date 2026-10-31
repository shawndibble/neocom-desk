import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Long enough to read as a change of view, short enough never to hold up reading it. */
const FADE_MS = 220;

/** The tab-panel rise (DESIGN.md §6b says why). */
const RISE = '8px';
const RISE_MS = 240;

/** `--motion-ease-out` in `index.css`: one curve for every arrival. */
const FADE_EASING = 'cubic-bezier(0.33, 1, 0.68, 1)';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Fades still running, by element: an outer fade cancels the ones inside it. */
const running = new Map<Animation, Element>();

/**
 * Fades `target` in as it mounts and whenever `key` changes: the route outlet
 * on a page change (`Layout`), a tab panel on a tab switch
 * (`useTabPanelProps`). `rise` adds a short rise into place — tab panels only,
 * never the outlet (DESIGN.md §6b); nothing under reduced motion.
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
export function useFadeOnChange(
  target: RefObject<HTMLElement | null>,
  key: string,
  { rise = false }: { rise?: boolean } = {}
): void {
  const shownKey = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (shownKey.current === key) return;
    shownKey.current = key;
    const node = target.current;
    if (node === null || typeof node.animate !== 'function') return;
    if (window.matchMedia?.(REDUCED_MOTION_QUERY).matches) return;
    // Cancel unfinished fades here and below (two would drive one property):
    // layout effects run inner-first, so a panel this change mounted has
    // already started its own. One movement per change, the outermost.
    for (const [animation, element] of running) {
      if (!node.contains(element)) continue;
      running.delete(animation);
      animation.cancel();
    }
    const keyframes = rise
      ? [
          { opacity: 0, translate: `0 ${RISE}` },
          { opacity: 1, translate: '0 0' },
        ]
      : [{ opacity: 0 }, { opacity: 1 }];
    const animation = node.animate(keyframes, {
      duration: rise ? RISE_MS : FADE_MS,
      easing: FADE_EASING,
    });
    running.set(animation, node);
    animation.onfinish = () => running.delete(animation);
  }, [target, key, rise]);
}
