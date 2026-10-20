// Collector books (issue #4507, spec #4504): the feeder record, its invite links
// and the callables behind them. No sync and no UI yet. Layout:
//
//   corpTaxBooks/{collector}/feeders/{feederCorp}  the feeder record (officer-readable, function-written)
//   corpTaxBookFeederInvites/{sha256(code)}        an invite link; only the hash is stored (function-only)
//   corpTaxBookFeederOf/{feederCorp}               feeder → Collector pointer (function-only)
//
// A corporation feeds one book or runs its own, never both. The feeder's
// mining-only grant (kind 'feeder' in corpTaxBookSyncGrants) arrives with the
// feeder sync ticket. Failures carry stable `reason` codes the UI maps later;
// no player-facing text lives here.

import { createHash } from 'node:crypto';
import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';
import { boundedString, newInviteCode, record } from './communities.js';
import {
  FEEDERS,
  FEEDER_INVITES_COLLECTION,
  FEEDER_OF_COLLECTION,
  decideRoles,
  parseBookCall,
  utcDate,
  type BookCall,
} from './corpTaxBook.js';
import { reopenPeriod, type CoveragePeriod } from './corpTaxBookEngine.js';
import { ROLES_SCOPE } from './corpTaxBookEsi.js';
import {
  appendAudit,
  authorizeOfficer,
  bookRef,
  type BookDeps,
  type Caller,
} from './corpTaxBookStore.js';
import { characterIdForUid } from './verifyEveToken.js';

export type FeederStatus = 'active' | 'pending-removal' | 'removed' | 'left' | 'disconnected';

/** `corpTaxBooks/{collector}/feeders/{feederCorp}`. */
export interface FeederRecord {
  corporationId: number;
  status: FeederStatus;
  /** The Character who made the invite link. */
  invitedBy: number;
  joinedAt: number;
  leftAt?: number;
  /** The Character holding the feeder's mining grant; set by the grant ticket. */
  grantHolder?: number;
  lastSyncResult?: { at: number; outcome: 'synced' | 'skipped'; reason?: string };
  /** One payee: a corporation or a player. */
  payee?: { kind: 'corporation' | 'character'; id: number };
  payeeChangedAt?: number;
  mode: 'normal' | 'settled-otherwise';
  note?: string;
  /** The owner rate the invite offered, if it carried one. */
  offeredOwnerRatePct?: number;
  coveragePeriods: CoveragePeriod[];
}

/** `corpTaxBookFeederInvites/{hash}`. */
export interface FeederInviteDoc {
  collectorCorporationId: number;
  createdBy: number;
  createdAt: number;
  offeredOwnerRatePct?: number;
  revokedAt?: number;
  acceptedBy?: number;
  acceptedAt?: number;
  acceptedByCorporationId?: number;
}

/** Open (neither revoked nor accepted) invite links one book may hold. */
export const MAX_OPEN_FEEDER_INVITES = 20;

export const hashInviteCode = (code: string) => createHash('sha256').update(code).digest('hex');

const inviteRef = (db: BookDeps['db'], id: string) =>
  db.collection(FEEDER_INVITES_COLLECTION).doc(id);

function fail(code: FunctionsErrorCode, message: string, reason: string): never {
  throw new HttpsError(code, message, { reason });
}

// --- Input -----------------------------------------------------------------

export interface CreateFeederInviteInput extends BookCall {
  /** The owner rate the link offers the feeder; absent means none offered. */
  offeredOwnerRatePct?: number;
}

export function parseCreateFeederInviteInput(data: unknown): CreateFeederInviteInput {
  const d = record(data);
  const call = parseBookCall(data);
  const rate = d.offeredOwnerRatePct;
  if (rate === undefined) return call;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new HttpsError('invalid-argument', 'offeredOwnerRatePct must be 0-100');
  }
  return { ...call, offeredOwnerRatePct: rate };
}

export interface RevokeFeederInviteInput extends BookCall {
  inviteId: string;
}

export function parseRevokeFeederInviteInput(data: unknown): RevokeFeederInviteInput {
  const d = record(data);
  const inviteId = boundedString(d.inviteId, 'inviteId', 64);
  if (!/^[0-9a-f]{64}$/.test(inviteId)) {
    throw new HttpsError('invalid-argument', 'inviteId is not an invite id');
  }
  return { ...parseBookCall(data), inviteId };
}

export interface AcceptFeederInviteInput {
  code: string;
  accessToken: string;
}

export function parseAcceptFeederInviteInput(data: unknown): AcceptFeederInviteInput {
  const d = record(data);
  return {
    code: boundedString(d.code, 'code', 64),
    accessToken: boundedString(d.accessToken, 'accessToken', 8192),
  };
}

// --- Create and revoke -----------------------------------------------------

async function requireActiveBook(deps: BookDeps, corporationId: number): Promise<void> {
  const book = await bookRef(deps.db, corporationId).get();
  if (!book.exists || book.get('active') !== true) {
    fail('not-found', 'This corporation has no Corp Tax Book', 'no-book');
  }
}

export async function createFeederInvite(
  deps: BookDeps,
  caller: Caller,
  input: CreateFeederInviteInput
): Promise<{ code: string; inviteId: string }> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  await requireActiveBook(deps, input.corporationId);
  const code = newInviteCode();
  const inviteId = hashInviteCode(code);
  const now = deps.now();
  await deps.db.runTransaction(async (tx) => {
    const open = await tx.get(
      deps.db
        .collection(FEEDER_INVITES_COLLECTION)
        .where('collectorCorporationId', '==', input.corporationId)
    );
    const openCount = open.docs.filter((d) => !d.get('revokedAt') && !d.get('acceptedAt')).length;
    if (openCount >= MAX_OPEN_FEEDER_INVITES) {
      fail('resource-exhausted', 'Too many open invite links', 'too-many-invites');
    }
    const doc: FeederInviteDoc = {
      collectorCorporationId: input.corporationId,
      createdBy: access.characterId,
      createdAt: now,
      ...(input.offeredOwnerRatePct !== undefined
        ? { offeredOwnerRatePct: input.offeredOwnerRatePct }
        : {}),
    };
    tx.create(inviteRef(deps.db, inviteId), doc);
    appendAudit(
      tx,
      deps,
      input.corporationId,
      { characterId: access.characterId, name: access.characterName },
      'feederInviteCreated',
      {
        inviteId,
        ...(input.offeredOwnerRatePct !== undefined
          ? { offeredOwnerRatePct: input.offeredOwnerRatePct }
          : {}),
      }
    );
  });
  return { code, inviteId };
}

export async function revokeFeederInvite(
  deps: BookDeps,
  caller: Caller,
  input: RevokeFeederInviteInput
): Promise<{ revoked: true }> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  const ref = inviteRef(deps.db, input.inviteId);
  await deps.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const invite = snap.data() as FeederInviteDoc | undefined;
    // Another book's link reads as not found: a caller learns nothing about it.
    if (!invite || invite.collectorCorporationId !== input.corporationId) {
      fail('not-found', 'No such invite link', 'invite-invalid');
    }
    if (invite.acceptedAt) fail('failed-precondition', 'This link was already used', 'invite-used');
    if (invite.revokedAt) return;
    tx.update(ref, { revokedAt: deps.now() });
    appendAudit(
      tx,
      deps,
      input.corporationId,
      { characterId: access.characterId, name: access.characterName },
      'feederInviteRevoked',
      { inviteId: input.inviteId }
    );
  });
  return { revoked: true };
}

// --- Accept ----------------------------------------------------------------

export interface AcceptFeederInviteResult {
  collectorCorporationId: number;
  feederCorporationId: number;
  /** True when this reopened a record that had left or been removed. */
  rejoined: boolean;
}

/**
 * Accept an invite link as a member of the corporation that will feed. The caller
 * needs the edit role in their own corporation (read live from ESI). The record is
 * active at once; the first coverage period starts today (UTC), and a rejoin
 * reopens the same record with a new period.
 */
export async function acceptFeederInvite(
  deps: BookDeps,
  caller: Caller,
  input: AcceptFeederInviteInput
): Promise<AcceptFeederInviteResult> {
  const characterId = characterIdForUid(caller.uid);
  if (characterId === undefined)
    fail('unauthenticated', 'Sign in with a Character first', 'not-signed-in');
  let claims;
  try {
    claims = await deps.verifyToken(input.accessToken);
  } catch {
    throw new HttpsError('unauthenticated', 'EVE access token rejected');
  }
  if (claims.characterId !== characterId || claims.ownerHash !== caller.ownerHash) {
    fail('permission-denied', 'The access token is for a different Character', 'token-mismatch');
  }
  if (!claims.scopes.includes(ROLES_SCOPE)) {
    fail('failed-precondition', 'Grant the corporation roles scope first', 'missing-scope');
  }
  const identity = await deps.readIdentity(characterId, input.accessToken);
  const roles = decideRoles(identity.roles, identity.ceoId === characterId);
  if (!roles.canEdit) {
    fail('permission-denied', 'Only a CEO, Director or Accountant can accept', 'not-an-editor');
  }
  const feederCorp = identity.corporationId;
  const inviteId = hashInviteCode(input.code);
  const now = deps.now();
  const today = utcDate(now);

  return deps.db.runTransaction(async (tx) => {
    const invite = (await tx.get(inviteRef(deps.db, inviteId))).data() as
      FeederInviteDoc | undefined;
    if (!invite) fail('not-found', 'No such invite link', 'invite-invalid');
    if (invite.revokedAt) fail('failed-precondition', 'This link was revoked', 'invite-revoked');
    if (invite.acceptedAt) fail('failed-precondition', 'This link was already used', 'invite-used');
    const collector = invite.collectorCorporationId;
    if (collector === feederCorp) {
      fail('failed-precondition', 'A corporation cannot feed its own book', 'own-book-exists');
    }
    const collectorBook = await tx.get(bookRef(deps.db, collector));
    if (!collectorBook.exists || collectorBook.get('active') !== true) {
      fail('failed-precondition', 'That book is no longer open', 'collector-gone');
    }
    if ((await tx.get(bookRef(deps.db, feederCorp))).exists) {
      fail('failed-precondition', 'This corporation runs its own book', 'own-book-exists');
    }
    const pointerRef = deps.db.collection(FEEDER_OF_COLLECTION).doc(String(feederCorp));
    const pointer = (await tx.get(pointerRef)).data();
    if (pointer)
      fail('failed-precondition', 'This corporation already feeds a book', 'already-feeder');
    const feederRef = bookRef(deps.db, collector).collection(FEEDERS).doc(String(feederCorp));
    const held = (await tx.get(feederRef)).data() as FeederRecord | undefined;

    let rejoined = false;
    if (!held) {
      const created: FeederRecord = {
        corporationId: feederCorp,
        status: 'active',
        invitedBy: invite.createdBy,
        joinedAt: now,
        mode: 'normal',
        ...(invite.offeredOwnerRatePct !== undefined
          ? { offeredOwnerRatePct: invite.offeredOwnerRatePct }
          : {}),
        coveragePeriods: [{ from: today }],
      };
      tx.create(feederRef, created);
    } else {
      // The pointer is gone only once the record has left or been removed.
      if (held.status !== 'left' && held.status !== 'removed') {
        fail('failed-precondition', 'This corporation already feeds this book', 'feeder-active');
      }
      rejoined = true;
      const kept: FeederRecord = { ...held };
      delete kept.leftAt;
      const reopened: FeederRecord = {
        ...kept,
        status: 'active',
        invitedBy: invite.createdBy,
        joinedAt: now,
        ...(invite.offeredOwnerRatePct !== undefined
          ? { offeredOwnerRatePct: invite.offeredOwnerRatePct }
          : {}),
        coveragePeriods: reopenPeriod(held.coveragePeriods, today),
      };
      tx.set(feederRef, reopened);
    }
    tx.set(pointerRef, { collectorCorporationId: collector, since: now });
    const accepted: Partial<FeederInviteDoc> = {
      acceptedBy: characterId,
      acceptedAt: now,
      acceptedByCorporationId: feederCorp,
    };
    tx.update(inviteRef(deps.db, inviteId), accepted);
    appendAudit(
      tx,
      deps,
      collector,
      { characterId, name: claims.name },
      rejoined ? 'feederRejoined' : 'feederJoined',
      { feederCorporationId: feederCorp, inviteId }
    );
    return { collectorCorporationId: collector, feederCorporationId: feederCorp, rejoined };
  });
}
