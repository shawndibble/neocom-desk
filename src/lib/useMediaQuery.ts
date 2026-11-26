import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-read when `query` itself changes
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export const COARSE_POINTER_QUERY = '(pointer: coarse)';

export const NO_HOVER_QUERY = '(hover: none)';

export function useTouchContext(): 'touch' | undefined {
  return useMediaQuery(COARSE_POINTER_QUERY) ? 'touch' : undefined;
}

export const MD_UP_QUERY = '(min-width: 48rem)';

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
