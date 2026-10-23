// SRP (issue #4848, ADR 0026): the admin-SDK half of the callables. Parsing is
// in srp.ts, the layout and shapes in srpTypes.ts. Every write to a
// corporation's SRP data goes through here and appends to the immutable audit
// log in the same transaction; clients have no write path (firestore.rules).
// The caller's EVE access token is verified and used for ESI reads, then
// dropped: it is never written to Firestore or to the audit log.
//
// Two kinds of caller (ADR 0026):
//   - a member: any Character in the corporation, proven by public affiliation;
//   - an officer: Director or Accountant (the CEO holds every role), re-read
//     from ESI roles. Settings need a Director; the CEO can always reclaim.

import { randomBytes } from 'node:crypto';
import { type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  ACCESS_TTL_MS,
  decideRoles,
  isCacheFresh,
  satisfies,
  type BookCall,
  type Need,
  type OfficerAccess,
} from './corpTaxBook.js';
import { ROLES_SCOPE, type CorporationLookup } from './corpTaxBookEsi.js';
import { fail, type BookDeps, type Caller } from './corpTaxBookStore.js';
import {
  CORPS_COLLECTION,
  SRP_AUDIT,
  SRP_OFFICERS,
  SRP_SCHEMA_VERSION,
  SRP_SETTINGS_COLLECTION,
  SRP_SETTINGS_DOC,
  defaultSrpSettings,
  type SrpSettings,
  type SrpSettingsPatch,
} from './srpTypes.js';
import { characterIdForUid, type EveTokenClaims } from './verifyEveToken.js';

export interface SrpDeps extends Pick<BookDeps, 'db' | 'now' | 'verifyToken' | 'readIdentity'> {
  /** A Character's corporation from public ESI: no token, no scope. */
  lookupCorporation: CorporationLookup;
}

const corpRef = (db: Firestore, corporationId: number) =>
  db.collection(CORPS_COLLECTION).doc(String(corporationId));
export const srpSettingsRef = (db: Firestore, corporationId: number) =>
  corpRef(db, corporationId).collection(SRP_SETTINGS_COLLECTION).doc(SRP_SETTINGS_DOC);
const officersOf = (db: Firestore, corporationId: number) =>
  corpRef(db, corporationId).collection(SRP_OFFICERS);

const rand = () => randomBytes(6).toString('base64url');

/** The token must be this Character's own, for this deployment's EVE app. */
async function verifiedClaims(
  deps: SrpDeps,
  caller: Caller,
  accessToken: string | undefined
): Promise<EveTokenClaims> {
  const characterId = characterIdForUid(caller.uid);
  if (characterId === undefined)
    fail('unauthenticated', 'Sign in with a Character first', 'not-signed-in');
  if (accessToken === undefined)
    fail('invalid-argument', 'accessToken is required', 'token-required');
  let claims: EveTokenClaims;
  try {
    claims = await deps.verifyToken(accessToken);
  } catch {
    // Opaque on purpose; mintFirebaseToken logs the cause.
    throw new HttpsError('unauthenticated', 'EVE access token rejected');
  }
  if (claims.characterId !== characterId || claims.ownerHash !== caller.ownerHash) {
    fail('permission-denied', 'The access token is for a different Character', 'token-mismatch');
  }
  return claims;
}

// --- Member check ----------------------------------------------------------

export interface SrpMember {
  characterId: number;
  characterName: string;
  corporationId: number;
}

/**
 * Whether the caller is in the corporation right now, from public affiliation.
 * Needs no corp scope and no role, so any pilot passes. The file-claim callable
 * (#4850) also checks the corporation at the time of the loss.
 */
export async function authorizeMember(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall
): Promise<SrpMember> {
  const claims = await verifiedClaims(deps, caller, call.accessToken);
  const corporationId = await deps.lookupCorporation(claims.characterId);
  if (corporationId !== call.corporationId) {
    fail('permission-denied', 'Not a member of this corporation', 'wrong-corp');
  }
  return { characterId: claims.characterId, characterName: claims.name, corporationId };
}

// --- Officer check ---------------------------------------------------------

/**
 * Establishes what the caller may do as an SRP officer. Officer calls re-check
 * live (`live: true`, the default): ESI roles are read on every call. The
 * 24-hour `srpOfficers/{uid}` record that lets rules show the officer the
 * queue is (re)written whenever SRP has been turned on and the caller holds
 * Director or Accountant, and deleted when a renewal finds them demoted or gone.
 */
export async function authorizeSrpOfficer(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall,
  need: Extract<Need, 'edit' | 'director' | 'ceo'>,
  options: { live: boolean } = { live: true }
): Promise<OfficerAccess> {
  const claims = await verifiedClaims(deps, caller, call.accessToken);
  const accessToken = call.accessToken as string; // verifiedClaims refused an absent one
  const now = deps.now();
  const officerRef = officersOf(deps.db, call.corporationId).doc(caller.uid);
  const held = (await officerRef.get()).data() as OfficerAccess | undefined;
  const heldUsable =
    held !== undefined &&
    held.ownerHash === caller.ownerHash &&
    held.corporationId === call.corporationId &&
    held.expiresAt > now &&
    isCacheFresh(held.checkedAt, now);

  let access: OfficerAccess;
  if (!options.live && heldUsable) {
    access = held;
  } else {
    if (!claims.scopes.includes(ROLES_SCOPE)) {
      if (held) await officerRef.delete();
      fail('failed-precondition', 'Grant the corporation roles scope first', 'missing-scope');
    }
    const identity = await deps.readIdentity(claims.characterId, accessToken);
    if (identity.corporationId !== call.corporationId) {
      if (held) await officerRef.delete();
      fail('permission-denied', 'Not a member of this corporation', 'wrong-corp');
    }
    const roles = decideRoles(identity.roles, identity.ceoId === claims.characterId);
    if (!roles.canEdit) {
      // A failed renewal revokes the read access the old check granted.
      if (held) await officerRef.delete();
      fail('permission-denied', 'No SRP officer role in this corporation', 'not-an-officer');
    }
    access = {
      ...roles,
      characterId: claims.characterId,
      characterName: claims.name,
      ownerHash: caller.ownerHash,
      corporationId: call.corporationId,
      roles: identity.roles,
      checkedAt: now,
      expiresAt: now + ACCESS_TTL_MS,
    };
    if ((await srpSettingsRef(deps.db, call.corporationId).get()).exists) {
      await officerRef.set(access);
    }
  }
  if (!satisfies(access, need)) {
    throw new HttpsError('permission-denied', `This needs the ${need} role`, {
      reason: 'role-required',
      need,
    });
  }
  return access;
}

// --- Audit -----------------------------------------------------------------

function appendSrpAudit(
  tx: Transaction,
  deps: SrpDeps,
  corporationId: number,
  access: OfficerAccess,
  action: string,
  detail: Record<string, unknown>
): void {
  const at = deps.now();
  tx.create(
    corpRef(deps.db, corporationId)
      .collection(SRP_AUDIT)
      .doc(`${String(at).padStart(15, '0')}~${rand()}`),
    { at, by: access.characterId, byName: access.characterName, action, detail }
  );
}

// --- Callables -------------------------------------------------------------

export interface VerifySrpOfficerResult {
  corporationId: number;
  isCeo: boolean;
  isDirector: boolean;
  canManage: boolean;
  srpEnabled: boolean;
  expiresAt: number;
}

/** Checks roles with ESI and records officer access for 24 hours, so rules show the queue. */
export async function verifySrpOfficer(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall
): Promise<VerifySrpOfficerResult> {
  const access = await authorizeSrpOfficer(deps, caller, call, 'edit', { live: false });
  const settings = (await srpSettingsRef(deps.db, call.corporationId).get()).data();
  return {
    corporationId: call.corporationId,
    isCeo: access.isCeo,
    isDirector: access.isDirector,
    canManage: access.canEdit,
    srpEnabled: settings?.enabled === true,
    expiresAt: access.expiresAt,
  };
}

export interface SrpStatus {
  corporationId: number;
  enabled: boolean;
  /** The rules a pilot sees when filing; absent while SRP is off. */
  settings?: Pick<
    SrpSettings,
    'killmailPct' | 'appraisalPct' | 'hullRules' | 'windowDays' | 'requireFleetOrFc'
  >;
}

/** What a member needs to show the SRP page: is it on, and the corp's rules. Members read no doc. */
export async function getSrpStatus(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall
): Promise<SrpStatus> {
  await authorizeMember(deps, caller, call);
  const data = (await srpSettingsRef(deps.db, call.corporationId).get()).data() as
    SrpSettings | undefined;
  if (!data || data.enabled !== true) return { corporationId: call.corporationId, enabled: false };
  return {
    corporationId: call.corporationId,
    enabled: true,
    settings: {
      killmailPct: data.killmailPct,
      appraisalPct: data.appraisalPct,
      hullRules: data.hullRules,
      windowDays: data.windowDays,
      requireFleetOrFc: data.requireFleetOrFc,
    },
  };
}

/** A Director turns SRP on: first time it creates the defaults, later it re-enables kept settings. */
export async function turnOnSrp(deps: SrpDeps, caller: Caller, call: BookCall) {
  const access = await authorizeSrpOfficer(deps, caller, call, 'director');
  const now = deps.now();
  const ref = srpSettingsRef(deps.db, call.corporationId);
  await deps.db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (current.get('enabled') === true) {
      fail('already-exists', 'This corporation already has SRP on', 'srp-on');
    }
    if (current.exists) {
      tx.update(ref, { enabled: true, updatedAt: now, updatedBy: access.characterId });
    } else {
      const settings: SrpSettings = {
        ...defaultSrpSettings(),
        corporationId: call.corporationId,
        enabled: true,
        createdBy: access.characterId,
        createdAt: now,
        ownerCharacterId: access.characterId,
        updatedAt: now,
        updatedBy: access.characterId,
        schemaVersion: SRP_SCHEMA_VERSION,
      };
      tx.create(ref, settings);
    }
    tx.set(officersOf(deps.db, call.corporationId).doc(caller.uid), access);
    appendSrpAudit(tx, deps, call.corporationId, access, 'turnOn', { reenabled: current.exists });
  });
  return { corporationId: call.corporationId };
}

/** A Director turns SRP off: members stop seeing it; claims, rules and the log are kept. */
export async function turnOffSrp(deps: SrpDeps, caller: Caller, call: BookCall) {
  const access = await authorizeSrpOfficer(deps, caller, call, 'director');
  const ref = srpSettingsRef(deps.db, call.corporationId);
  await deps.db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (current.get('enabled') !== true) fail('failed-precondition', 'SRP is not on', 'srp-off');
    tx.update(ref, { enabled: false, updatedAt: deps.now(), updatedBy: access.characterId });
    appendSrpAudit(tx, deps, call.corporationId, access, 'turnOff', {});
  });
  return { corporationId: call.corporationId };
}

/** A Director saves the corp's percents, Hull Rules, claim window and Fleet-or-FC requirement. */
export async function saveSrpSettings(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall,
  patch: SrpSettingsPatch
) {
  const access = await authorizeSrpOfficer(deps, caller, call, 'director');
  const ref = srpSettingsRef(deps.db, call.corporationId);
  await deps.db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists) fail('not-found', 'This corporation has no SRP yet', 'no-srp');
    tx.update(ref, { ...patch, updatedAt: deps.now(), updatedBy: access.characterId });
    appendSrpAudit(tx, deps, call.corporationId, access, 'saveSettings', {
      fields: Object.keys(patch),
      ...(patch.hullRules ? { hullRuleCount: patch.hullRules.length } : {}),
    });
  });
  return { corporationId: call.corporationId };
}

/** The CEO can always reclaim SRP: becomes owner, turns it on, and every other officer must re-verify. */
export async function reclaimSrp(deps: SrpDeps, caller: Caller, call: BookCall) {
  const access = await authorizeSrpOfficer(deps, caller, call, 'ceo');
  const ref = srpSettingsRef(deps.db, call.corporationId);
  const revoked = await deps.db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists) fail('not-found', 'This corporation has no SRP yet', 'no-srp');
    const officers = await tx.get(officersOf(deps.db, call.corporationId));
    let count = 0;
    for (const doc of officers.docs) {
      if (doc.id === caller.uid) continue;
      tx.delete(doc.ref);
      count += 1;
    }
    tx.update(ref, {
      enabled: true,
      ownerCharacterId: access.characterId,
      updatedAt: deps.now(),
      updatedBy: access.characterId,
    });
    tx.set(officersOf(deps.db, call.corporationId).doc(caller.uid), access);
    appendSrpAudit(tx, deps, call.corporationId, access, 'reclaim', { officersRevoked: count });
    return count;
  });
  return { officersRevoked: revoked };
}
