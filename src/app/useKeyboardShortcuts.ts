import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SHORTCUTS } from '@/lib/shortcuts';

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
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      // An open overlay — the native <dialog> (Modal.tsx) or a Radix menu/
      // listbox (DropdownMenu/ContextMenu/Select, none of which force-mount
      // while closed) — owns the keyboard until it's dismissed, rather than
      // also acting on whatever else is bound.
      if (document.querySelector('dialog[open], [role="menu"], [role="listbox"]')) return;

      // Lower-cased so Caps Lock (which reports `event.key` as 'C', not 'c',
      // with `shiftKey: false`) doesn't silently defeat a letter shortcut.
      const key = event.key.toLowerCase();
      const shortcut = SHORTCUTS.find((candidate) => candidate.key.toLowerCase() === key);
      if (!shortcut?.run) return;

      event.preventDefault();
      shortcut.run(navigate);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate]);
}
