import { useEffect, useRef } from 'react';
import { isAltChord, isApplePlatform, isModChord } from './shortcuts';

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

export function useAltChord(code: string, onChord: () => void, enabled = true): void {
  const latest = useRef(onChord);
  useEffect(() => {
    latest.current = onChord;
  });
  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (!isAltChord(event, code) || event.repeat) return;
      if (document.querySelector('dialog[open]')) return;
      event.preventDefault();
      latest.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [code, enabled]);
}
