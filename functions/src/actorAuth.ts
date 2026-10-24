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

/** The signed-in Character behind a callable's `request.auth`, or `not-signed-in`. */
export function callerFromAuth(
  auth: { uid: string; token: Record<string, unknown> } | undefined
): Caller {
  const ownerHash = auth?.token.ownerHash;
  if (!auth || typeof ownerHash !== 'string') {
    fail('unauthenticated', 'Sign in with a Character first', 'not-signed-in');
  }
  const caller = { uid: auth.uid, ownerHash };
  signedInCharacter(caller);
  return caller;
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

/** A caller whose token verified: the Character, its claims, and that same token. */
export interface VerifiedActor {
  characterId: number;
  claims: EveTokenClaims;
  /** The token `claims` were read from: ESI is read with this and no other. */
  accessToken: string;
}

/** The token must be this caller's own Character (and owner, so a transferred one fails). */
export async function verifyCallerToken(
  deps: { verifyToken: (accessToken: string) => Promise<EveTokenClaims> },
  caller: Caller,
  accessToken: string | undefined,
  options: VerifyOptions = {}
): Promise<VerifiedActor> {
  const characterId = signedInCharacter(caller);
  if (accessToken === undefined)
    fail('invalid-argument', 'accessToken is required', 'token-required');
  const claims = await verifyAccessToken(deps.verifyToken, accessToken, options);
  assertOwnToken(caller, characterId, claims);
  return { characterId, claims, accessToken };
}

/** `token-mismatch` unless the claims are this signed-in Character, same owner. */
export function assertOwnToken(caller: Caller, characterId: number, claims: EveTokenClaims): void {
  if (claims.characterId !== characterId || claims.ownerHash !== caller.ownerHash) {
    fail('permission-denied', 'The access token is for a different Character', 'token-mismatch');
  }
}

/** The refusals `requireLiveRoles` itself emits, besides the caller's own role reason. */
export const DENY_REASON = { missingScope: 'missing-scope', wrongCorp: 'wrong-corp' } as const;
export type LiveRolesDenyReason = (typeof DENY_REASON)[keyof typeof DENY_REASON];

const MISSING_SCOPE_MESSAGE = 'Grant the corporation roles scope first';

/** `missing-scope` unless the token carries the corporation roles scope. */
export function requireRolesScope(claims: EveTokenClaims): void {
  if (!claims.scopes.includes(ROLES_SCOPE)) {
    fail('failed-precondition', MISSING_SCOPE_MESSAGE, DENY_REASON.missingScope);
  }
}

export interface LiveRolesOptions<Role extends string = string> {
  /** Refuse `wrong-corp` unless the Character is in this corporation now. */
  corporationId?: number;
  /** The role the call needs. */
  need: 'canView' | 'canEdit';
  /** The refusal for a Character without the role. */
  denied: { message: string; reason: Role };
  /** Runs before any refusal, e.g. to revoke a cached grant the failed check supersedes. */
  onDenied?: (reason: LiveRolesDenyReason | Role) => Promise<void> | void;
}

/** Roles read live from ESI with the actor's verified token; throws the refusal when not held. */
export async function requireLiveRoles<Role extends string>(
  deps: { readIdentity: IdentityReader },
  actor: VerifiedActor,
  options: LiveRolesOptions<Role>
): Promise<{ identity: CorpIdentity; roles: OfficerRoles }> {
  // The one refusal path: onDenied, then a throw.
  const deny = async (
    code: FunctionsErrorCode,
    message: string,
    reason: LiveRolesDenyReason | Role
  ): Promise<never> => {
    await options.onDenied?.(reason);
    return fail(code, message, reason);
  };
  if (!actor.claims.scopes.includes(ROLES_SCOPE)) {
    return deny('failed-precondition', MISSING_SCOPE_MESSAGE, DENY_REASON.missingScope);
  }
  const identity = await deps.readIdentity(actor.characterId, actor.accessToken);
  if (options.corporationId !== undefined && identity.corporationId !== options.corporationId) {
    return deny('permission-denied', 'Not a member of this corporation', DENY_REASON.wrongCorp);
  }
  const roles = decideRoles(identity.roles, identity.ceoId === actor.characterId);
  if (!roles[options.need]) {
    return deny('permission-denied', options.denied.message, options.denied.reason);
  }
  return { identity, roles };
}
