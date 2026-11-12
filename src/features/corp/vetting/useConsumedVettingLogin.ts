import { useEffect, useState } from 'react';
import { dropVettingLogin, heldVettingLogin, type VettingLoginOutcome } from './vettingLoginState';

/**
 * The Vetting sign-in the callback left for this page, read once. It is read during the first
 * render and dropped from the holder as soon as the page commits, so from then on the access
 * token lives in this component's memory alone. Reading and dropping are two steps because a
 * render may run twice (StrictMode) or be thrown away before it commits; one step would lose
 * the login to the discarded render.
 */
export function useConsumedVettingLogin(): VettingLoginOutcome | null {
  const [login] = useState(heldVettingLogin);
  useEffect(() => {
    if (login !== null) dropVettingLogin(login);
  }, [login]);
  return login;
}
