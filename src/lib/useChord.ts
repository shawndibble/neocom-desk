import { useEffect, useRef } from 'react';
import { isApplePlatform, isModChord } from './shortcuts';

/**
 * Runs `onChord` for Ctrl+`key` (Cmd on Apple), from anywhere on the page,
 * text fields included. Always swallows the browser's own answer to the chord
 * (Ctrl+S's "save page"), even when `enabled` is false — a Save that is
 * unavailable right now must not fall through to the browser's. `onChord` is
 * skipped while a modal is open, so the dialog's own chord handling is the
 * only one that answers.
 */
export function useChord(
  key: string,
  onChord: () => void,
  options: { shift?: boolean; enabled?: boolean } = {}
): void {
  const latest = useRef(onChord);
  useEffect(() => {
    latest.current = onChord;
  });
  const { shift = false, enabled = true } = options;
  useEffect(() => {
    const apple = isApplePlatform();
    function onKeyDown(event: KeyboardEvent) {
      if (!isModChord(event, apple, key, { shift })) return;
      event.preventDefault();
      if (!enabled || document.querySelector('dialog[open]')) return;
      latest.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [key, shift, enabled]);
}
