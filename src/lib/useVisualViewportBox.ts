import { useEffect, useState } from 'react';

/** The part of the screen the pilot can actually see, keyboard excluded. */
export interface VisualViewportBox {
  height: number;
  offsetTop: number;
}

function read(): VisualViewportBox | null {
  const vv = typeof window === 'undefined' ? undefined : window.visualViewport;
  return vv ? { height: vv.height, offsetTop: vv.offsetTop } : null;
}

/**
 * Tracks `window.visualViewport` while `active`. `100dvh` does not shrink for
 * the iOS on-screen keyboard, so a full-viewport surface sizes itself to this
 * box instead. `null` where the API is missing (callers fall back to `dvh`).
 */
export function useVisualViewportBox(active: boolean): VisualViewportBox | null {
  const [box, setBox] = useState<VisualViewportBox | null>(() => (active ? read() : null));
  useEffect(() => {
    if (!active) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setBox(read());
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);
  return active ? box : null;
}
