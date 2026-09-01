import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

/**
 * jsdom 30 ships the `HTMLDialogElement` interface but none of its behaviour, so
 * a component built on the native `<dialog>` cannot be tested at all without
 * this. Only what component code can observe is emulated — `open` state, the
 * initial focus move, and Escape firing a *cancelable* `cancel`; there is no top
 * layer, `::backdrop` or inertness here, as there is none in jsdom.
 *
 * Cancelable is the point: `Modal` preventDefaults it, and a polyfill that
 * closed unconditionally on Escape would let that path pass untested.
 */
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const escapeHandlers = new WeakMap<HTMLDialogElement, (event: KeyboardEvent) => void>();

  function open(dialog: HTMLDialogElement, modal: boolean): void {
    if (dialog.open) return;
    dialog.setAttribute('open', '');
    if (!modal) return;

    const target =
      dialog.querySelector<HTMLElement>('[autofocus]') ??
      dialog.querySelector<HTMLElement>(FOCUSABLE);
    (target ?? dialog).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !dialog.open) return;
      event.preventDefault();
      const cancelled = !dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
      if (!cancelled) dialog.close();
    };
    escapeHandlers.set(dialog, onKeyDown);
    dialog.ownerDocument.addEventListener('keydown', onKeyDown);
  }

  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    open(this, false);
  };

  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    if (this.open) throw new DOMException('Dialog is already open', 'InvalidStateError');
    open(this, true);
  };

  HTMLDialogElement.prototype.close = function close(
    this: HTMLDialogElement,
    returnValue?: string
  ) {
    if (!this.open) return;
    const onKeyDown = escapeHandlers.get(this);
    if (onKeyDown) {
      this.ownerDocument.removeEventListener('keydown', onKeyDown);
      escapeHandlers.delete(this);
    }
    this.removeAttribute('open');
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.dispatchEvent(new Event('close'));
  };
}

/**
 * jsdom has no pointer-capture or scroll implementation, so Radix's menu and
 * select primitives — which capture the pointer during open/drag-select and
 * scroll the highlighted option into view — throw the moment a test opens one.
 */
if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

/**
 * jsdom does no layout, so every element's `offsetHeight`/`offsetWidth` is 0 —
 * `@tanstack/react-virtual` reads those (not `getBoundingClientRect`) to size
 * its scroll container, and a 0 viewport makes it compute an empty visible
 * range, hiding every row from the DOM regardless of what a test scrolls to.
 * The getter itself installs on the whole prototype (there's no way to patch
 * just one instance ahead of its creation), but the *value* it returns stays
 * 0 — jsdom's real default — for every element except ones marked
 * `data-virtual-scroll-root` by the component owning the scroll container, so
 * this can't skew unrelated layout reads elsewhere (e.g. Radix menu
 * positioning) even though the property descriptor itself is global.
 */
if (typeof HTMLElement !== 'undefined') {
  const VIRTUAL_SCROLL_SIZE = 600;
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.hasAttribute('data-virtual-scroll-root') ? VIRTUAL_SCROLL_SIZE : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.hasAttribute('data-virtual-scroll-root') ? VIRTUAL_SCROLL_SIZE : 0;
    },
  });
}

/**
 * jsdom has no `ResizeObserver`. `@tanstack/react-virtual` itself tolerates
 * that fine (its internal observer lazily no-ops when the constructor is
 * missing), but other libraries assume it exists unconditionally — this stub
 * is cheap insurance for whichever one hits that path next.
 */
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

/**
 * jsdom implements no CSS media queries, so `window.matchMedia` is absent and
 * anything subscribing to a breakpoint throws on mount. The never-matching
 * default is load-bearing, not incidental: `Layout` reads a non-matching
 * `(min-width: 48rem)` as mobile, which is what makes every "mobile More sheet"
 * test see a mobile viewport and get the sheet at all.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (media: string): MediaQueryList =>
    ({
      media,
      matches: false,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
