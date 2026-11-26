import { useEffect, useState } from 'react';

export interface VisualViewportBox {
  height: number;
  offsetTop: number;
}

function read(): VisualViewportBox | null {
  const vv = typeof window === 'undefined' ? undefined : window.visualViewport;
  return vv ? { height: vv.height, offsetTop: vv.offsetTop } : null;
}

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
