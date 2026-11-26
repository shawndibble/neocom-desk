import { useEffect, useState } from 'react';
import { dropVettingLogin, heldVettingLogin, type VettingLoginOutcome } from './vettingLoginState';

export function useConsumedVettingLogin(): VettingLoginOutcome | null {
  const [login] = useState(heldVettingLogin);
  useEffect(() => {
    if (login !== null) dropVettingLogin(login);
  }, [login]);
  return login;
}
