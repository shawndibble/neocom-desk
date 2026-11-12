/**
 * What a Vetting sign-in hands back, as router state, to the page it was pressed on
 * (`routes/Callback.tsx`). The access token rides here and in the page's memory only: the page
 * reads it once, hands it to the server and clears the state. Types and one guard, no imports,
 * because the eager callback route loads this.
 */
export type VettingLoginOutcome =
  | { status: 'ok'; accessToken: string; characterId: number; name: string }
  | { status: 'cancelled' }
  | { status: 'failed' };

export interface VettingCallbackState {
  vettingLogin: VettingLoginOutcome;
}

/** The outcome in a location's `state`, or null when it carries none (or something else). */
export function vettingLoginFrom(state: unknown): VettingLoginOutcome | null {
  const login = (state as Partial<VettingCallbackState> | null)?.vettingLogin;
  if (!login || typeof login !== 'object') return null;
  if (login.status === 'cancelled' || login.status === 'failed') return { status: login.status };
  if (
    login.status === 'ok' &&
    typeof login.accessToken === 'string' &&
    typeof login.characterId === 'number' &&
    typeof login.name === 'string'
  ) {
    return login;
  }
  return null;
}
