/**
 * Calls `onLeave` when the route moves to another path by a push or a pop: a
 * tab switch, a link to another page, Back. A replace that moves the path is
 * a redirect (`TabRoute`'s default-tab landing, a remembered tab, a legacy
 * path), the same visit, so it does not count. Every app action that replaces
 * onto another path while keeping the search is such a redirect; one that
 * drops the search drops `?info` with it. A new replace onto another page that
 * keeps the search would read as "still here".
 */
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
