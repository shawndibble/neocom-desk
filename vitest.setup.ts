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
