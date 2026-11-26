import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';
import { decideRoles, type OfficerRoles } from './corpTaxBook.js';
import { ROLES_SCOPE, type CorpIdentity, type IdentityReader } from './corpTaxBookEsi.js';
import { characterIdForUid, type EveTokenClaims } from './verifyEveToken.js';

export interface Caller {
  uid: string;
  ownerHash: string;
}

export function fail(code: FunctionsErrorCode, message: string, reason: string): never {
  throw new HttpsError(code, message, { reason });
}

export function signedInCharacter(caller: Caller): number {
  const characterId = characterIdForUid(caller.uid);
  if (characterId === undefined)
    fail('unauthenticated', 'Sign in with a Character first', 'not-signed-in');
  return characterId;
}

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
  onReject?: (err: unknown) => void;
  toError?: () => Error;
}

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

export interface VerifiedActor {
  characterId: number;
  claims: EveTokenClaims;
  accessToken: string;
}

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

export function assertOwnToken(caller: Caller, characterId: number, claims: EveTokenClaims): void {
  if (claims.characterId !== characterId || claims.ownerHash !== caller.ownerHash) {
    fail('permission-denied', 'The access token is for a different Character', 'token-mismatch');
  }
}

export const DENY_REASON = { missingScope: 'missing-scope', wrongCorp: 'wrong-corp' } as const;
export type LiveRolesDenyReason = (typeof DENY_REASON)[keyof typeof DENY_REASON];

const MISSING_SCOPE_MESSAGE = 'Grant the corporation roles scope first';

export function requireRolesScope(claims: EveTokenClaims): void {
  if (!claims.scopes.includes(ROLES_SCOPE)) {
    fail('failed-precondition', MISSING_SCOPE_MESSAGE, DENY_REASON.missingScope);
  }
}

export interface LiveRolesOptions<Role extends string = string> {
  corporationId?: number;
  wrongCorp?: Role;
  need: 'canView' | 'canEdit' | ((roles: OfficerRoles) => boolean);
  denied: { message: string; reason: Role };
  onDenied?: (reason: LiveRolesDenyReason | Role) => Promise<void> | void;
}

export async function requireLiveRoles<Role extends string>(
  deps: { readIdentity: IdentityReader },
  actor: VerifiedActor,
  options: LiveRolesOptions<Role>
): Promise<{ identity: CorpIdentity; roles: OfficerRoles }> {
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
    return deny(
      'permission-denied',
      'Not a member of this corporation',
      options.wrongCorp ?? DENY_REASON.wrongCorp
    );
  }
  const roles = decideRoles(identity.roles, identity.ceoId === actor.characterId);
  const held = typeof options.need === 'function' ? options.need(roles) : roles[options.need];
  if (!held) {
    return deny('permission-denied', options.denied.message, options.denied.reason);
  }
  return { identity, roles };
}
