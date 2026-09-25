/**
 * What a refused **write** (a mail send, a mark-read, an RSVP, Save to EVE)
 * tells the rest of the app.
 *
 * A 401/403 on a write means one of two things, and only one of them is fixed
 * by logging in again. If the stored grant lacks the scope the endpoint needs
 * (a token that predates `send_mail`, say), asking SSO for that endpoint's
 * Permission is the fix, so the shell notice is raised with the endpoint. If
 * the grant already holds the scope, ESI refused for its own reason (a
 * recipient who blocked the sender, a corporation ACL): a re-login would ask
 * for the same scopes, come back identical and be refused again, so the notice
 * would just loop. That case is left to the caller's own error message.
 *
 * Reads through `cache.ts` use `isWorthReportingToShell` for the inverse
 * question, whether a *held* scope has gone stale; a write has no such
 * fallback, since the next read discovers a revoke on its own.
 */
import { emitEsiAuthFailure } from './authFailureSignal';
import { isAuthFailure, EsiError } from './client';
import { grantHoldsEndpointScope } from './grantScope';
import type { EsiEndpointId } from './registry';

export type WriteAuthOutcome =
  /** Not an auth failure at all; nothing was reported. */
  | 'ignored'
  /** An auth failure with no Permission to ask for: reported plainly (a dead grant, a 401), or a refusal a re-login would not fix and so not reported. */
  | 'refused'
  /** The grant lacks the endpoint's scope; the shell notice now asks for its Permission. */
  | 'grant-needed';

export async function reportWriteAuthFailure(
  characterId: number,
  err: unknown,
  endpointId: EsiEndpointId
): Promise<WriteAuthOutcome> {
  if (!isAuthFailure(err)) return 'ignored';
  // A refresh grant that failed (an `AuthError`), or a 401: the credential was
  // not accepted, no single scope is to blame, and a fresh login replaces it.
  if (!(err instanceof EsiError) || err.status === 401) {
    emitEsiAuthFailure(characterId);
    return 'refused';
  }
  if (await grantHoldsEndpointScope(characterId, endpointId)) return 'refused';
  emitEsiAuthFailure(characterId, endpointId);
  return 'grant-needed';
}
