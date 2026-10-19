import { useLocation } from 'react-router-dom';

/** Prints the router's current `pathname + search`, so a test can read what the page wrote. */
export function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{`${pathname}${search}`}</output>;
}
