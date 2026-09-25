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
import { db } from '@/db';
import { emitEsiAuthFailure } from './authFailureSignal';
import { isAuthFailure, EsiError } from './client';
import { ESI_REGISTRY, isScopeRequired, type EsiEndpointId } from './registry';

export type WriteAuthOutcome =
  /** Not an auth failure at all; nothing was reported. */
  | 'ignored'
  /** An auth failure a re-login would not fix (or a dead refresh grant, reported plainly). */
  | 'refused'
  /** The grant lacks the endpoint's scope; the shell notice now asks for its Permission. */
  | 'grant-needed';

async function grantLacksScope(characterId: number, endpointId: EsiEndpointId): Promise<boolean> {
  const spec = ESI_REGISTRY[endpointId];
  if (!isScopeRequired(spec.scope)) return false;
  const token = await db.tokens.get(characterId);
  return !(token?.scopes ?? []).includes(spec.scope);
}

export async function reportWriteAuthFailure(
  characterId: number,
  err: unknown,
  endpointId: EsiEndpointId
): Promise<WriteAuthOutcome> {
  if (!isAuthFailure(err)) return 'ignored';
  // The refresh grant itself failing has no single scope to blame.
  if (!(err instanceof EsiError)) {
    emitEsiAuthFailure(characterId);
    return 'refused';
  }
  if (!(await grantLacksScope(characterId, endpointId))) return 'refused';
  emitEsiAuthFailure(characterId, endpointId);
  return 'grant-needed';
}
