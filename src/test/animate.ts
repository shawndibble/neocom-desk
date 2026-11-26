import { vi } from 'vitest';

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
