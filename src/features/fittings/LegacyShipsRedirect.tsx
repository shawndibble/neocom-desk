import { Navigate, useLocation } from 'react-router-dom';
import { legacyShipsLocation } from './fittingRoutes';

/**
 * The Ships section's old paths (`/fittings/*`, `/skills/ships`), redirected
 * for good: a history replace, so Back never bounces off the old URL, with
 * query and hash kept — every Fitting Share Code ever copied is `/fittings?f=`.
 */
export function LegacyShipsRedirect() {
  const { pathname, search, hash, state } = useLocation();
  return <Navigate replace to={legacyShipsLocation(pathname, search, hash)} state={state} />;
}
