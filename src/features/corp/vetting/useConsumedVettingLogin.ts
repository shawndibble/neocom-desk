import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { vettingLoginFrom, type VettingLoginOutcome } from './vettingLoginState';

/**
 * The Vetting sign-in the callback handed this page in router state, read once. The state is
 * cleared at once, so the access token lives in this component's memory alone: a reload, Back
 * or a copied tab finds no token in the history entry.
 */
export function useConsumedVettingLogin(): VettingLoginOutcome | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [login] = useState(() => vettingLoginFrom(location.state));
  const carried = vettingLoginFrom(location.state) !== null;
  useEffect(() => {
    if (!carried) return;
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { replace: true, state: null }
    );
  }, [carried, navigate, location.pathname, location.search, location.hash]);
  return login;
}
