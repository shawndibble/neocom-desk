import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { OVERLAY_SELECTOR, SHORTCUTS } from '@/lib/shortcuts';
import { useSingleKeyShortcuts } from '@/lib/singleKeyShortcuts';

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
 *
 * Every dispatched shortcut is a single unmodified key, so the Settings off
 * switch (`lib/singleKeyShortcuts.ts`, WCAG 2.1.4) simply leaves the listener
 * unattached.
 */
export function useKeyboardShortcuts(): void {
  const navigate = useNavigate();
  const enabled = useSingleKeyShortcuts((state) => state.value);

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      // Shift stays out of this list: `?` is typed with it. Opt-in below.
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
      // Shift narrows rather than widens: Shift+C stays an ordinary capital C
      // rather than a second way to fire the character switcher.
      if (event.shiftKey && !shortcut?.allowsShift) return;
      if (!shortcut?.run) return;

      event.preventDefault();
      shortcut.run(navigate);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate, enabled]);
}
