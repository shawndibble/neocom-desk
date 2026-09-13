import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { OVERLAY_SELECTOR, SHORTCUTS } from '@/lib/shortcuts';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

/**
 * Global shortcut listener, mounted once from `Layout` so every authenticated
 * route gets it. Escape has no `run` in `lib/shortcuts.ts` — the native
 * `<dialog>` already closes on it (`components/ui/Modal.tsx`), and a second
 * handler here would race that behaviour rather than add to it.
 */
export function useKeyboardShortcuts(): void {
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Shift is not in this list, unlike the other three: it is how `?` is
      // typed on a common layout, and dropping every Shift-held press made
      // the one key a user already reaches for to ask "what are the
      // shortcuts" impossible to bind. A Shift-held press still has to match
      // a shortcut that opted in (`allowsShift`), below.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      // An open overlay owns the keyboard until it's dismissed, rather than
      // also acting on whatever else is bound. What counts as one lives in
      // `lib/shortcuts.ts`'s OVERLAY_SELECTOR — the native <dialog>
      // (Modal.tsx), the Radix primitives (none of which force-mount while
      // closed), and anything that opts in with the overlay attribute.
      if (document.querySelector(OVERLAY_SELECTOR)) return;

      // Lower-cased so Caps Lock (which reports `event.key` as 'C', not 'c',
      // with `shiftKey: false`) doesn't silently defeat a letter shortcut.
      const key = event.key.toLowerCase();
      const shortcut = SHORTCUTS.find((candidate) => candidate.key.toLowerCase() === key);
      if (!shortcut?.run) return;
      // Shift narrows rather than widens: `?` is reachable because it asked
      // to be, and Shift+C stays an ordinary capital C rather than a second
      // way to fire the character switcher.
      if (event.shiftKey && !shortcut.allowsShift) return;

      event.preventDefault();
      shortcut.run(navigate);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate]);
}
