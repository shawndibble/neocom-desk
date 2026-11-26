import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType, type Location } from 'react-router-dom';

export function usePageLeave(onLeave: (location: Location) => void): void {
  const location = useLocation();
  const navigationType = useNavigationType();
  const shownPathname = useRef(location.pathname);
  useEffect(() => {
    if (shownPathname.current === location.pathname) return;
    shownPathname.current = location.pathname;
    if (navigationType === 'REPLACE') return;
    onLeave(location);
  }, [location, navigationType, onLeave]);
}
