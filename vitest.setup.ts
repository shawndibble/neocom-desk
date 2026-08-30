import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

/**
 * jsdom 30 ships the `HTMLDialogElement` interface but none of its behaviour —
 * `showModal`, `show` and `close` are all missing, so a component built on the
 * native `<dialog>` (see `src/components/ui/Modal.tsx`) cannot be tested at all
 * without this. There is no top layer, no `::backdrop` and no inertness in
 * jsdom, and none of that is emulated here; what is emulated is only the part
 * component code can observe: the `open` state, the initial focus move, and
 * Escape firing a *cancelable* `cancel` event before the dialog closes itself.
 *
 * `cancel` being cancelable matters: the Modal preventDefaults it so React
 * stays the source of truth for open/closed. A polyfill that closed
 * unconditionally on Escape would let that path pass untested.
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
 * jsdom implements no CSS media queries at all, so `window.matchMedia` is
 * simply absent — anything that subscribes to a breakpoint (Layout closes the
 * mobile "More" sheet when the viewport crosses `md`) throws on mount. Stub the
 * minimum surface: a query that never matches and never changes, which is the
 * right default for a layout-less environment.
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
