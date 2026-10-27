import { useEffect, useRef } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useNavigate } from 'react-router-dom';
import { isTypingTarget, OVERLAY_SELECTOR, SHORTCUTS } from '@/lib/shortcuts';
import { advanceSequence, IDLE, type SequenceState } from '@/lib/shortcutSequence';
import { useSingleKeyShortcuts } from '@/lib/singleKeyShortcuts';

const SEQUENCE_BY_KEY = new Map(
  SHORTCUTS.filter((shortcut) => shortcut.sequence).map((shortcut) => [shortcut.key, shortcut])
);

/**
 * Global shortcut listener, mounted once from `Layout` so every authenticated
 * route gets it. Escape has no `run` in `lib/shortcuts.ts` — the native
 * `<dialog>` already closes on it (`components/ui/Modal.tsx`), and a second
 * handler here would race that behaviour rather than add to it.
 *
 * Page keys are `g` then a letter (`lib/shortcutSequence.ts`); `?` is the one
 * single key. The Settings "Single-key shortcuts" switch turns all of them off
 * (scope decision `20261016-*-shortcuts-become-g-sequences-with-an-off-switch`);
 * until it has loaded the listener stays off, so a pilot who switched them off
 * never gets a live key on a cold load. (The setting keeps its "single-key" name
 * for WCAG 2.1.4's wording; its storage key is `singleKeyShortcuts`.) Typing in a field never fires one
 * (`isTypingTarget`).
 */
export function useKeyboardShortcuts(): void {
  const navigate = useNavigate();
  const hydrated = useHydratedStore(useSingleKeyShortcuts);
  const enabled = useSingleKeyShortcuts((s) => s.value) && hydrated;
  const sequence = useRef<SequenceState>(IDLE);

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      // Shift stays out of this list: `?` is typed with it. Opt-in below.
      if (event.ctrlKey || event.metaKey || event.altKey) {
        sequence.current = IDLE;
        return;
      }
      // A bare modifier press is not "another key": Shift+/ for `?` and
      // Shift+G for a capital must not cancel a pending `g`.
      if (event.key === 'Shift' || event.key === 'CapsLock') return;
      if (isTypingTarget(event.target)) {
        sequence.current = IDLE;
        return;
      }
      // An open overlay owns the keyboard until it's dismissed, rather than
      // also acting on whatever else is bound. What counts as one lives in
      // `lib/shortcuts.ts`'s OVERLAY_SELECTOR — the native <dialog>
      // (Modal.tsx), the Radix primitives (none of which force-mount while
      // closed), and anything that opts in with the overlay attribute.
      if (document.querySelector(OVERLAY_SELECTOR)) {
        sequence.current = IDLE;
        return;
      }

      // Lower-cased so Caps Lock (which reports `event.key` as 'G', not 'g',
      // with `shiftKey: false`) doesn't silently defeat a letter shortcut.
      const key = event.key.toLowerCase();
      // Shift narrows rather than widens: Shift+G stays an ordinary capital G
      // rather than a second way to start a sequence.
      if (event.shiftKey && !SHORTCUTS.some((s) => s.allowsShift && s.key === key)) {
        sequence.current = IDLE;
        return;
      }

      if (!event.shiftKey) {
        const result = advanceSequence(sequence.current, key, event.timeStamp, (k) =>
          SEQUENCE_BY_KEY.has(k)
        );
        sequence.current = result.state;
        if (result.kind === 'pending') return;
        if (result.kind === 'match') {
          event.preventDefault();
          SEQUENCE_BY_KEY.get(result.key)?.run?.(navigate);
          return;
        }
      } else {
        sequence.current = IDLE;
      }

      const single = SHORTCUTS.find((s) => !s.sequence && s.key.toLowerCase() === key);
      if (!single?.run) return;
      event.preventDefault();
      single.run(navigate);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate, enabled]);
}
