import { vi } from 'vitest';

/**
 * jsdom has no Web Animations API: stands a mock `Element.prototype.animate`
 * (and the `getAnimations` that finds what it started) in for it. `cancel` is
 * called with the cancelled animation's element. `restore` removes both, back
 * to jsdom's own (none).
 */
export function stubAnimate() {
  const cancel = vi.fn<(target: Element) => void>();
  const live: { target: Element; animation: Animation }[] = [];
  function track(target: Element, options?: KeyframeAnimationOptions): Animation {
    const animation = {
      id: options?.id ?? '',
      cancel: () => {
        live.splice(
          live.findIndex((entry) => entry.animation === animation),
          1
        );
        cancel(target);
      },
    } as unknown as Animation;
    live.push({ target, animation });
    return animation;
  }
  const animate = vi.fn(function (
    this: Element,
    _keyframes: Keyframe[],
    options?: KeyframeAnimationOptions
  ) {
    return track(this, options);
  });
  function getAnimations(this: Element, options?: GetAnimationsOptions) {
    return live
      .filter(({ target }) => target === this || (options?.subtree && this.contains(target)))
      .map(({ animation }) => animation);
  }
  for (const [name, value] of Object.entries({ animate, getAnimations })) {
    Object.defineProperty(Element.prototype, name, { value, writable: true, configurable: true });
  }
  return {
    animate,
    cancel,
    restore: () => {
      delete (Element.prototype as Partial<Element>).animate;
      delete (Element.prototype as Partial<Element>).getAnimations;
    },
  };
}
