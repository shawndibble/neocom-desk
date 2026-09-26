import { useState, useEffect } from 'react';

const TICK_MS = 60_000;

/** `Date.now()` is impure, so a live-ticking countdown reads it only inside this hook's `useState` initializer / interval — never directly in a component's render body (react-hooks/purity). */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}
