import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { BootScreen } from './BootScreen';

/**
 * Auth gate: the whole feature area sits behind a logged-in Character. A
 * layout route, so it wraps all twelve feature routes at once rather than
 * being re-derived per view.
 *
 * Deliberately answers one question only — *is anyone logged in* — and
 * redirects when the answer is no. Whether that Character granted the scope a
 * particular view needs is a different question with a different remedy
 * (stay put, show `ReauthBanner`); that is `ScopeGate`, and the two must not
 * be merged.
 *
 * Two states that are emphatically not "logged out":
 *  - `useLiveQuery` still resolving (`undefined`). Redirecting on that would
 *    bounce every user to /login on every cold load.
 *  - Characters exist but none is active yet. Picking one is what
 *    `/characters` is for, and each character-scoped route already sends the
 *    user there; sending them to /login instead would ask them to re-do a
 *    login they have already done.
 */
export function RequireCharacter() {
  const location = useLocation();
  const characterCount = useLiveQuery(() => db.characters.count());

  if (characterCount === undefined) return <BootScreen />;
  if (characterCount > 0) return <Outlet />;

  // `state.from` is recorded, not yet consumed: a post-login return-to flow is
  // a later change, and throwing the destination away now would design it out.
  return (
    <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  );
}
