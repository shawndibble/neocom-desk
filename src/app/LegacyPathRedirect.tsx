import { Navigate, useLocation } from 'react-router-dom';
import { legacyLocation } from './legacyPaths';

/**
 * A moved view's old path (`legacyPaths.ts`), redirected for good: a history
 * replace, so Back never bounces off the old URL.
 */
export function LegacyPathRedirect() {
  const { pathname, search, hash, state } = useLocation();
  return <Navigate replace to={legacyLocation(pathname, search, hash)} state={state} />;
}
