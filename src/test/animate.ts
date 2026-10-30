import { vi } from 'vitest';

/**
 * jsdom has no Web Animations API: stands a mock `Element.prototype.animate`
 * in for it. `restore` removes it, back to jsdom's own (none).
 */
export function stubAnimate() {
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ cancel }));
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
