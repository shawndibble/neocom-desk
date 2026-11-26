import { useLayoutEffect, useRef, type RefObject } from 'react';

const FADE_MS = 220;

const RISE = '8px';
const RISE_MS = 240;

const FADE_EASING = 'cubic-bezier(0.33, 1, 0.68, 1)';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const running = new Map<Animation, Element>();

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
