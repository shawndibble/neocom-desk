import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, expect } from 'vitest';
import { settleEsiCacheLoads } from '@/esi/cache';
import { claimSessionHint, resetSessionHints } from '@/lib/hintFlags';
import { restoreRealTimers, unmountAtTestEnd } from '@/test/teardown';
import { fakeMediaQueryList } from '@/test/viewport';

beforeEach(() => {
  resetSessionHints();
  for (const hint of ['rowHint', 'columnPickerHint', 'goTo'])
    claimSessionHint(`${hint}:test-setup`);
});

configure({ asyncUtilTimeout: 5000 });

unmountAtTestEnd(cleanup);
afterEach(async () => {
  restoreRealTimers();
  cleanup();
  try {
    await settleEsiCacheLoads(1000);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[esi settle] ${expect.getState().currentTestName}: ${reason}`);
  }
});

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const escapeHandlers = new WeakMap<HTMLDialogElement, (event: KeyboardEvent) => void>();
  const modalStack: HTMLDialogElement[] = [];

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
      if (modalStack.at(-1) !== dialog) return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      const cancelled = !dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
      if (!cancelled) dialog.close();
    };
    escapeHandlers.set(dialog, onKeyDown);
    modalStack.push(dialog);
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
    const stackIndex = modalStack.indexOf(this);
    if (stackIndex !== -1) modalStack.splice(stackIndex, 1);
    this.removeAttribute('open');
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.dispatchEvent(new Event('close'));
  };
}

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
  window.scrollTo = () => {};
}

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

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (media: string): MediaQueryList => fakeMediaQueryList(media, false);
}
