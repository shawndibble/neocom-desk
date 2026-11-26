import { Navigate, useLocation } from 'react-router-dom';
import { legacyLocation } from './legacyPaths';

export function LegacyPathRedirect() {
  const { pathname, search, hash, state } = useLocation();
  return <Navigate replace to={legacyLocation(pathname, search, hash)} state={state} />;
}
