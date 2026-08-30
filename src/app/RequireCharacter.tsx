import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { BootScreen } from './BootScreen';

/**
 * Auth gate: the whole feature area sits behind a logged-in Character. A layout
 * route, so every feature route is wrapped at once.
 *
 * Two states that are emphatically not "logged out":
 *  - `useLiveQuery` still resolving (`undefined`) — redirecting on that would
 *    bounce every user to /login on every cold load.
 *  - Characters exist but none is active yet. `/characters` is where one is
 *    picked, and every character-scoped route already sends the user there.
 */
export function RequireCharacter() {
  const location = useLocation();
  const characterCount = useLiveQuery(() => db.characters.count());

  if (characterCount === undefined) return <BootScreen />;
  if (characterCount > 0) return <Outlet />;

  // `state.from` is recorded, not yet consumed: throwing the destination away
  // now would design a post-login return-to flow out.
  return (
    <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  );
}
