// The token provider `App.tsx` hands to `configureEsi`. Every authenticated ESI
// call funnels through here before any request is made, so it is the one place
// that can see a *total* auth failure without `src/esi` reaching into a store.
import { getValidAccessToken } from '@/auth/session';
import { AuthError } from '@/auth/sso';
import { isAuthFailure } from '@/esi/client';
import { useAuthFailure } from '@/stores/authFailure';

/**
 * Is this the "nothing will work until you log in again" failure?
 *
 * Two narrowings, both load-bearing:
 *  - Only `getValidAccessToken`'s own errors reach here, so an `EsiError` is
 *    structurally impossible — and `isAuthFailure` counts a 403 as an auth
 *    failure, which for ESI can mean a structure ACL that re-auth cannot fix.
 *  - `AuthError` is thrown for *any* non-2xx from the SSO token endpoint, so a
 *    transient 503 would otherwise log the user out. Match on the OAuth code,
 *    never the status: SSO answers 400 for `invalid_request` too, and a proxy
 *    can 400 with a body that isn't JSON at all (`network_error`). Only
 *    `invalid_grant` means the grant itself is gone.
 */
export function isTotalAuthFailure(err: unknown): boolean {
  if (!isAuthFailure(err)) return false;
  if (!(err instanceof AuthError)) return false;
  return err.code === 'invalid_grant';
}

/**
 * `getValidAccessToken`, plus: a dead grant is published to the auth-failure
 * store, a live one clears that character's stale failure. Rethrows unchanged
 * either way — callers must keep seeing the original error.
 */
export async function getAccessTokenReportingFailures(characterId: number): Promise<string> {
  try {
    const token = await getValidAccessToken(characterId);
    useAuthFailure.getState().clearFor(characterId, 'token');
    return token;
  } catch (err) {
    if (isTotalAuthFailure(err)) useAuthFailure.getState().reportTokenFailure(characterId);
    throw err;
  }
}
