import { useEffect, useRef } from 'react';
import { isAltChord, isApplePlatform, isModChord } from './shortcuts';

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

/**
 * Runs `onChord` for Alt+`code` (Option on Apple), e.g. `'KeyJ'`, from anywhere
 * on the page, text fields included. Swallows the key's own answer (Option+J's
 * `∆`) only while `enabled`, so a disabled chord leaves typing alone. Skipped
 * while a modal is open.
 */
export function useAltChord(code: string, onChord: () => void, enabled = true): void {
  const latest = useRef(onChord);
  useEffect(() => {
    latest.current = onChord;
  });
  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (!isAltChord(event, code) || event.repeat) return;
      event.preventDefault();
      if (document.querySelector('dialog[open]')) return;
      latest.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [code, enabled]);
}
