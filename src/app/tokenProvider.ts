// The token provider `App.tsx` hands to `configureEsi`, wrapped so a dead
// refresh grant is reported once, centrally, instead of surfacing as nine
// separate empty views.
//
// This is the only place in the app that can see a *total* auth failure
// without touching `src/esi`: every authenticated ESI call funnels through
// this one function, and it runs before any request is made.
import { getValidAccessToken } from '@/auth/session';
import { AuthError } from '@/auth/sso';
import { isAuthFailure } from '@/esi/client';
import { useAuthFailure } from '@/stores/authFailure';

/**
 * Is this the "nothing will work until you log in again" failure?
 *
 * Two narrowings, both load-bearing:
 *  - Only `getValidAccessToken`'s own errors reach here, so an `EsiError` is
 *    structurally impossible. That matters because `isAuthFailure` treats a
 *    403 as an auth failure, and ESI answers 403 for a structure a character
 *    isn't on the ACL of — re-auth cannot fix that, and bouncing such a user
 *    to /login would be wrong. It cannot happen through this path.
 *  - `AuthError` is thrown for *any* non-2xx from the SSO token endpoint
 *    (`auth/sso.ts`), so a transient 503 would otherwise log the user out.
 *    Match on the OAuth code, never the status: EVE SSO answers 400
 *    `invalid_grant` for a revoked or expired refresh token, but it answers
 *    400 for `invalid_request` too, and a proxy can return a 400 whose body
 *    isn't JSON at all (`network_error`). Only `invalid_grant` means the grant
 *    itself is gone and re-authorizing is the remedy.
 */
export function isTotalAuthFailure(err: unknown): boolean {
  if (!isAuthFailure(err)) return false;
  if (!(err instanceof AuthError)) return false;
  return err.code === 'invalid_grant';
}

/**
 * `getValidAccessToken`, plus: a dead grant is published to the auth-failure
 * store and a live one clears any stale failure for that character. Rethrows
 * unchanged either way — callers must keep seeing the original error.
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
