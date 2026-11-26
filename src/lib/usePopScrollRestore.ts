import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

export const POP_RESTORE_GIVE_UP_MS = 3000;

const savedScroll = new Map<string, number>();

const INPUT_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

export function usePopScrollRestore(): void {
  const location = useLocation();
  const navigationType = useNavigationType();

  const keyRef = useRef(location.key);
  const targetRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    keyRef.current = location.key;
    const y = navigationType === 'POP' ? savedScroll.get(location.key) : undefined;
    targetRef.current = y !== undefined && y > 0 ? y : null;
  }, [location.key, navigationType]);

  useEffect(() => {
    const save = () => savedScroll.set(keyRef.current, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, []);

  useEffect(() => {
    const y = targetRef.current;
    if (y === null) return;
    const startedAt = Date.now();
    let frame = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      for (const type of INPUT_EVENTS) window.removeEventListener(type, stop);
    };
    const tick = () => {
      const room = document.documentElement.scrollHeight - window.innerHeight;
      if (room >= y) {
        stop();
        window.scrollTo(0, y);
        return;
      }
      if (Date.now() - startedAt > POP_RESTORE_GIVE_UP_MS) {
        stop();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    for (const type of INPUT_EVENTS) window.addEventListener(type, stop, { passive: true });
    tick();
    return stop;
  }, [location.key, navigationType]);
}
