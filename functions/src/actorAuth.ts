// Verified-actor authorization: the one place a callable turns (caller, EVE access token,
// corporation, capability) into a verified actor or one opaque failure.
//
//   signedInCharacter   uid is `char:{id}`            -> reason `not-signed-in`
//   verifyAccessToken   the token verifies, any cause -> opaque "EVE access token rejected"
//   verifyCallerToken   ...and is the caller's own    -> reason `token-mismatch`
//   requireLiveRoles    roles scope + live ESI read   -> `missing-scope`, `wrong-corp`, role refusal
//
// Cached-vs-live (ADR 0023 D7, 0026 D8) stays with the stores: they own the officer record
// they cache, and call `requireLiveRoles` only when the cache cannot answer. Refresh tokens
// never come here. Pure of Firestore.
import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';
import { decideRoles, type OfficerRoles } from './corpTaxBook.js';
import { ROLES_SCOPE, type CorpIdentity, type IdentityReader } from './corpTaxBookEsi.js';
import { characterIdForUid, type EveTokenClaims } from './verifyEveToken.js';

/** Who is calling: the Firebase uid `char:{id}` and the ownerHash claim. */
export interface Caller {
  uid: string;
  ownerHash: string;
}

/** Throws an HttpsError carrying a stable `reason` for the UI to map. */
export function fail(code: FunctionsErrorCode, message: string, reason: string): never {
  throw new HttpsError(code, message, { reason });
}

/** A Character signed in: its id, or `not-signed-in`. */
export function signedInCharacter(caller: Caller): number {
  const characterId = characterIdForUid(caller.uid);
  if (characterId === undefined)
    fail('unauthenticated', 'Sign in with a Character first', 'not-signed-in');
  return characterId;
}

export interface VerifyOptions {
  /** Sees the real cause for logging; it never reaches the client. */
  onReject?: (err: unknown) => void;
  /** The error to throw instead of the callable HttpsError (the Alerts Grant has its own). */
  toError?: () => Error;
}

/** The token's claims, or one opaque rejection: which validation step failed is never told. */
export async function verifyAccessToken(
  verify: (accessToken: string) => Promise<EveTokenClaims>,
  accessToken: string,
  options: VerifyOptions = {}
): Promise<EveTokenClaims> {
  try {
    return await verify(accessToken);
  } catch (err) {
    options.onReject?.(err);
    throw options.toError?.() ?? new HttpsError('unauthenticated', 'EVE access token rejected');
  }
}

export interface Actor {
  characterId: number;
  claims: EveTokenClaims;
}

/** The token must be this caller's own Character (and owner, so a transferred one fails). */
export async function verifyCallerToken(
  deps: { verifyToken: (accessToken: string) => Promise<EveTokenClaims> },
  caller: Caller,
  accessToken: string | undefined,
  options: VerifyOptions = {}
): Promise<Actor> {
  const characterId = signedInCharacter(caller);
  if (accessToken === undefined)
    fail('invalid-argument', 'accessToken is required', 'token-required');
  const claims = await verifyAccessToken(deps.verifyToken, accessToken, options);
  assertOwnToken(caller, characterId, claims);
  return { characterId, claims };
}

/** `token-mismatch` unless the claims are this signed-in Character, same owner. */
export function assertOwnToken(caller: Caller, characterId: number, claims: EveTokenClaims): void {
  if (claims.characterId !== characterId || claims.ownerHash !== caller.ownerHash) {
    fail('permission-denied', 'The access token is for a different Character', 'token-mismatch');
  }
}

/** `missing-scope` unless the token carries the corporation roles scope. */
export function requireRolesScope(claims: EveTokenClaims): void {
  if (!claims.scopes.includes(ROLES_SCOPE)) {
    fail('failed-precondition', 'Grant the corporation roles scope first', 'missing-scope');
  }
}

/** `missing-scope`, `wrong-corp`, or the caller's role reason. */
export type DenyReason = string;

export interface LiveRolesOptions {
  /** Refuse `wrong-corp` unless the Character is in this corporation now. */
  corporationId?: number;
  /** The role the call needs. */
  need: 'canView' | 'canEdit';
  /** The refusal for a Character without the role. */
  denied: { message: string; reason: string };
  /** Runs before any refusal, e.g. to revoke a cached grant the failed check supersedes. */
  onDenied?: (reason: DenyReason) => Promise<void> | void;
}

/** Roles read live from ESI with the caller's token; throws the refusal when not held. */
export async function requireLiveRoles(
  deps: { readIdentity: IdentityReader },
  actor: Actor,
  accessToken: string,
  options: LiveRolesOptions
): Promise<{ identity: CorpIdentity; roles: OfficerRoles }> {
  const deny = async (
    code: FunctionsErrorCode,
    message: string,
    reason: DenyReason
  ): Promise<never> => {
    await options.onDenied?.(reason);
    return fail(code, message, reason);
  };
  if (!actor.claims.scopes.includes(ROLES_SCOPE)) {
    await options.onDenied?.('missing-scope');
    requireRolesScope(actor.claims); // throws
  }
  const identity = await deps.readIdentity(actor.characterId, accessToken);
  if (options.corporationId !== undefined && identity.corporationId !== options.corporationId) {
    await deny('permission-denied', 'Not a member of this corporation', 'wrong-corp');
  }
  const roles = decideRoles(identity.roles, identity.ceoId === actor.characterId);
  if (!roles[options.need]) {
    await deny('permission-denied', options.denied.message, options.denied.reason);
  }
  return { identity, roles };
}
