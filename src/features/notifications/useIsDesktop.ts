import { useEffect, useState } from 'react';

/** Matches Layout.tsx's phone/desktop line (#114). */
const DESKTOP_QUERY = '(min-width: 48rem)';

/** True at or above `md`. Where a layout choice needs JS (a sheet instead of an inline panel), not just CSS. */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches
  );
  useEffect(() => {
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    desktop.addEventListener('change', onChange);
    return () => desktop.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}
