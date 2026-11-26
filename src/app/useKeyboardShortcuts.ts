import { useEffect, useRef } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useNavigate } from 'react-router-dom';
import { isTypingTarget, OVERLAY_SELECTOR, SHORTCUTS } from '@/lib/shortcuts';
import { advanceSequence, IDLE, type SequenceState } from '@/lib/shortcutSequence';
import { useSingleKeyShortcuts } from '@/lib/singleKeyShortcuts';

const SEQUENCE_BY_KEY = new Map(
  SHORTCUTS.filter((shortcut) => shortcut.sequence).map((shortcut) => [shortcut.key, shortcut])
);

export function useKeyboardShortcuts(): void {
  const navigate = useNavigate();
  const hydrated = useHydratedStore(useSingleKeyShortcuts);
  const enabled = useSingleKeyShortcuts((s) => s.value) && hydrated;
  const sequence = useRef<SequenceState>(IDLE);

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        sequence.current = IDLE;
        return;
      }
      if (event.key === 'Shift' || event.key === 'CapsLock') return;
      if (isTypingTarget(event.target)) {
        sequence.current = IDLE;
        return;
      }
      if (document.querySelector(OVERLAY_SELECTOR)) {
        sequence.current = IDLE;
        return;
      }

      const key = event.key.toLowerCase();
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
      if (single.run(navigate) !== false) event.preventDefault();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate, enabled]);
}
