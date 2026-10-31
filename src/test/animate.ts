import { vi } from 'vitest';

/**
 * jsdom has no Web Animations API: stands a mock `Element.prototype.animate`
 * in for it. `cancel` is called with the cancelled animation's element.
 * `restore` removes it, back to jsdom's own (none).
 */
export function stubAnimate() {
  const cancel = vi.fn<(target: Element) => void>();
  const animate = vi.fn(function (this: Element) {
    return { cancel: () => cancel(this) } as unknown as Animation;
  });
  Object.defineProperty(Element.prototype, 'animate', {
    value: animate,
    writable: true,
    configurable: true,
  });
  return {
    animate,
    cancel,
    restore: () => {
      delete (Element.prototype as Partial<Element>).animate;
    },
  };
}
