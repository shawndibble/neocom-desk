import { useCallback, useEffect, useRef } from 'react';

interface Pending {
  fn: () => void;
  keepFocus: boolean;
}

/**
 * For a menu item that opens a dialog (or an inline field) instead of acting
 * at once. Opened from `onSelect`, the dialog would record the menu item as
 * the element to give focus back to — and the item unmounts as the menu
 * closes, so closing the dialog dropped focus to the top of the page. `run`
 * holds the callback until the menu has closed and Radix has put focus back
 * on its trigger, so the dialog restores focus to the menu button (WCAG 2.4.3).
 *
 * Pass `onCloseAutoFocus` to `DropdownMenuContent`; in an item's `onSelect`,
 * call `run(() => setOpen(true))`. `keepFocus` stops the trigger taking focus
 * first, for an item that hands focus to a field of its own (an inline
 * rename). A caller's own `onCloseAutoFocus` goes in as the argument and
 * still runs on every close.
 */
export function useOpenAfterMenu(onCloseAutoFocus?: (event: Event) => void) {
  const pending = useRef<Pending | null>(null);
  const callerRef = useRef(onCloseAutoFocus);
  useEffect(() => {
    callerRef.current = onCloseAutoFocus;
  });

  const run = useCallback((fn: () => void, options: { keepFocus?: boolean } = {}) => {
    pending.current = { fn, keepFocus: options.keepFocus ?? false };
  }, []);

  const handleCloseAutoFocus = useCallback((event: Event) => {
    const next = pending.current;
    pending.current = null;
    if (next?.keepFocus) event.preventDefault();
    callerRef.current?.(event);
    // Radix focuses the trigger after this handler returns, unless prevented;
    // the callback's state update renders after that, so the dialog opens
    // with the trigger already focused.
    next?.fn();
  }, []);

  return { run, onCloseAutoFocus: handleCloseAutoFocus };
}
