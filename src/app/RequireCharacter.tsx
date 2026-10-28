import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { BootScreen } from './BootScreen';
import { useCharacterCountOrLoading } from '@/features/character/useCharacters';

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
  const characterCount = useCharacterCountOrLoading();

  if (characterCount === undefined) return <BootScreen gate="require-character" />;
  if (characterCount > 0) return <Outlet />;

  // `state.from` is the destination `/login` stashes for the post-login return.
  return (
    <Navigate
      to="/login"
      replace
      state={{ from: `${location.pathname}${location.search}${location.hash}` }}
    />
  );
}
