import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { BootScreen } from './BootScreen';
import { useCharacterCountOrLoading } from '@/features/character/useCharacters';
import { NotFound } from '@/routes/NotFound';

export function RequireCharacter({ isKnownPath }: { isKnownPath?: (pathname: string) => boolean }) {
  const location = useLocation();
  const characterCount = useCharacterCountOrLoading();

  if (characterCount === undefined) return <BootScreen gate="require-character" />;
  if (characterCount > 0) return <Outlet />;
  if (isKnownPath && !isKnownPath(location.pathname)) return <NotFound />;

  return (
    <Navigate
      to="/login"
      replace
      state={{ from: `${location.pathname}${location.search}${location.hash}` }}
    />
  );
}
