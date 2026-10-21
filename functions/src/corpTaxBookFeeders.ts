// Collector books (issue #4507, spec #4504): the feeder record, its invite links
// and the callables behind them. No sync and no UI yet. Layout:
//
//   corpTaxBooks/{collector}/feeders/{feederCorp}  the feeder record (officer-readable, function-written)
//   corpTaxBookFeederInvites/{sha256(code)}        an invite link; only the hash is stored (function-only)
//   corpTaxBookFeederOf/{feederCorp}               feeder → Collector pointer (function-only)
//   corpTaxBookFeederPrevious/{feederCorp}         set when a feeder leaves, so its after-leaving view still resolves (function-only)
//
// A corporation feeds one book or runs its own, never both. The feeder's
// mining-only grant (kind 'feeder' in corpTaxBookSyncGrants) arrives with the
// feeder sync ticket. Failures carry stable `reason` codes the UI maps later;
// no player-facing text lives here.

import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { boundedString, newInviteCode, record } from './communities.js';
import {
  FEEDER_INVITES_COLLECTION,
  FEEDER_OF_COLLECTION,
  decideRoles,
  parseBookCall,
  pctField,
  utcDate,
  type BookCall,
} from './corpTaxBook.js';
import {
  reopenPeriod,
  type CoveragePeriod,
  type FeederModeChange,
  type OwnerRateEntry,
  type Removal,
} from './corpTaxBookEngine.js';
import { ROLES_SCOPE } from './corpTaxBookEsi.js';
import { appendAgreedRate } from './corpTaxBookFeederOwnerCalls.js';
import { refreshMemberCoverage } from './corpTaxBookFeederView.js';
import {
  appendAudit,
  authorizeOfficer,
  bookRef,
  fail,
  feederRef,
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
  lastSyncResult?: { at: number; outcome: 'synced' | 'skipped' | 'stale'; reason?: string };
  /** Last ledger read that landed (ms); a feeder's days are Billable only after one past their grace. */
  lastReadWellAt?: number;
  /** When ESI first refused the ledger in the current spell (ms); absent when the ledger reads fine. */
  staleSince?: number;
  /** When it disconnected after 30 days stale (ms). */
  disconnectedAt?: number;
  /** One payee: a corporation or a player. */
  payee?: { kind: 'corporation' | 'character'; id: number };
  payeeChangedAt?: number;
  /** A removal the accounting corporation started (#4520); present while status is `pending-removal`. */
  removal?: Removal;
  /** The id (hash) of the removal mail's link; the link's code is only ever in the mail. */
  removalLinkId?: string;
  mode: 'normal' | 'settled-otherwise';
  note?: string;
  /** The Character (the signed-in player) who handed over the mining grant; the holder may be their alt. */
  grantedBy?: number;
  /** The rate the feeder asked for at grant time (0-100); the Collector's agreed rate wins when set. */
  requestedRatePct?: number;
  /** The rate the Collector set; absent until one is. */
  agreedRatePct?: number;
  /** The owner rate the invite offered, if it carried one. */
  offeredOwnerRatePct?: number;
  coveragePeriods: CoveragePeriod[];
  /**
   * The owner rate history (#4512). Absent on records written before it existed: the
   * feeder view then derives entries from `requestedRatePct` / `agreedRatePct`.
   */
  ownerRateHistory?: OwnerRateEntry[];
  /** Dated mode switches (#4510); absent means derive from `mode`. */
  modeChanges?: FeederModeChange[];
  /** When the corporation's officers dismissed the after-leaving view (ms). */
  viewDismissedAt?: number;
  /**
   * Free-text refinery labels by structure id (#4640): either side's officers set one, the last
   * edit replaces it. Kept here, not in the view, so they carry on across a rejoin.
   */
  refineryLabels?: Record<string, RefineryLabelDoc>;
}

/** One refinery's label on a moon owner's record. */
export interface RefineryLabelDoc {
  label: string;
  /** ISO instant of the edit. */
  setAt: string;
  setBy: number;
  side: 'accounting' | 'moon-owner';
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
  return { ...call, offeredOwnerRatePct: pctField(rate, 'offeredOwnerRatePct') };
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

// --- Preview ---------------------------------------------------------------

export interface FeederInvitePreview {
  collectorCorporationId: number;
  /** The book's own name setting; absent when never set (the client resolves the public name). */
  collectorName: string | null;
  offeredOwnerRatePct: number | null;
}

export function parsePreviewFeederInviteInput(data: unknown): { code: string } {
  return { code: boundedString(record(data).code, 'code', 64) };
}

/**
 * What the consent screen shows before the grant: who the link is from and the rate it
 * offers. Holding the code is the standing; a revoked, used or unknown link, or one whose
 * book is closed, all read the same.
 */
export async function previewFeederInvite(
  deps: BookDeps,
  caller: Caller,
  input: { code: string }
): Promise<FeederInvitePreview> {
  if (characterIdForUid(caller.uid) === undefined)
    fail('unauthenticated', 'Sign in with a Character first', 'not-signed-in');
  const invite = (await inviteRef(deps.db, hashInviteCode(input.code)).get()).data() as
    FeederInviteDoc | undefined;
  const book =
    invite && !invite.revokedAt && !invite.acceptedAt
      ? await bookRef(deps.db, invite.collectorCorporationId).get()
      : undefined;
  if (!invite || !book?.exists || book.get('active') !== true) {
    fail('not-found', 'No such invite link', 'invite-invalid');
  }
  const name = book.get('corporationName');
  return {
    collectorCorporationId: invite.collectorCorporationId,
    collectorName: typeof name === 'string' && name !== '' ? name : null,
    offeredOwnerRatePct: invite.offeredOwnerRatePct ?? null,
  };
}

// --- Accept ----------------------------------------------------------------

export interface AcceptFeederInviteResult {
  collectorCorporationId: number;
  feederCorporationId: number;
  /** True when this reopened a record that had left, been removed or disconnected. */
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
  const accepted = await acceptInviteCore(deps, {
    code: input.code,
    characterId,
    name: claims.name,
    feederCorp: identity.corporationId,
  });
  // A join or rejoin opens coverage; the miners' copy follows (#4622).
  await refreshMemberCoverage(
    deps.db,
    accepted.collectorCorporationId,
    accepted.feederCorporationId
  );
  return {
    collectorCorporationId: accepted.collectorCorporationId,
    feederCorporationId: accepted.feederCorporationId,
    rejoined: accepted.rejoined,
  };
}

/** What the mining-only grant path needs to put back if the first ledger read is refused. */
export interface AcceptUndo {
  /** The feeder record before the accept; absent when the accept created it. */
  priorRecord?: FeederRecord;
  /** The pointer before the accept: only a disconnected moon owner taken back has one. */
  priorPointer?: { collectorCorporationId: number; since: number };
  inviteId: string;
}

/** Per-feed sync state that never carries into a new coverage period. */
const FEED_STATE: readonly (keyof FeederRecord)[] = [
  'leftAt',
  'staleSince',
  'disconnectedAt',
  'lastSyncResult',
  'viewDismissedAt',
  // The offered rate belongs to the link, not to the record's history.
  'offeredOwnerRatePct',
  // A holder's standing belongs to the feed it granted; a rejoin names its own.
  'grantHolder',
  'grantedBy',
];

/** The agreed rate an accepted link's offer stands for, dated the join day. */
function offeredRate(base: FeederRecord, invite: FeederInviteDoc, now: number) {
  const pct = invite.offeredOwnerRatePct;
  if (pct === undefined) return {};
  return {
    offeredOwnerRatePct: pct,
    agreedRatePct: pct,
    ownerRateHistory: appendAgreedRate(base, pct, now),
  };
}

export interface AcceptCoreInput {
  code: string;
  characterId: number;
  name: string;
  feederCorp: number;
  /** Extra fields stamped on the new or reopened record (the grant path's holder). */
  recordExtra?: Partial<FeederRecord>;
  /**
   * Take back a disconnected moon owner of this book. Only the grant path sets it: a
   * take-back without a fresh grant would only go stale and disconnect again.
   */
  allowTakeBack?: boolean;
}

/**
 * The accept transaction, after the caller's standing is settled: the roles-scope
 * path checks the edit role first, the mining-only grant path leaves that to the
 * ledger read (decision 20261020-141656).
 */
export async function acceptInviteCore(
  deps: BookDeps,
  input: AcceptCoreInput
): Promise<AcceptFeederInviteResult & { undo: AcceptUndo }> {
  const { characterId, feederCorp } = input;
  const claims = { name: input.name };
  const extra = input.recordExtra ?? {};
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
    const pointer = (await tx.get(pointerRef)).data() as AcceptUndo['priorPointer'];
    const recordRef = feederRef(deps.db, collector, feederCorp);
    const held = (await tx.get(recordRef)).data() as FeederRecord | undefined;
    // A disconnected moon owner keeps its pointer; this book's fresh link takes it back.
    const takenBack =
      input.allowTakeBack === true &&
      pointer?.collectorCorporationId === collector &&
      held?.status === 'disconnected';
    if (pointer && !takenBack)
      fail('failed-precondition', 'This corporation already feeds a book', 'already-feeder');

    let rejoined = false;
    let priorRecord: FeederRecord | undefined;
    if (!held) {
      const created: FeederRecord = {
        corporationId: feederCorp,
        status: 'active',
        invitedBy: invite.createdBy,
        joinedAt: now,
        mode: 'normal',
        coveragePeriods: [{ from: today }],
      };
      tx.create(recordRef, { ...created, ...offeredRate(created, invite, now), ...extra });
    } else {
      // The pointer is gone only once the record has left or been removed, or kept while disconnected.
      if (held.status !== 'left' && held.status !== 'removed' && !takenBack) {
        fail('failed-precondition', 'This corporation already feeds this book', 'feeder-active');
      }
      rejoined = true;
      priorRecord = held;
      const kept: FeederRecord = { ...held };
      for (const key of FEED_STATE) delete kept[key];
      const reopened: FeederRecord = {
        ...kept,
        status: 'active',
        invitedBy: invite.createdBy,
        joinedAt: now,
        ...offeredRate(held, invite, now),
        coveragePeriods: reopenPeriod(held.coveragePeriods, today),
        ...extra,
      };
      tx.set(recordRef, reopened);
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
    return {
      collectorCorporationId: collector,
      feederCorporationId: feederCorp,
      rejoined,
      undo: {
        inviteId,
        ...(priorRecord ? { priorRecord } : {}),
        ...(pointer ? { priorPointer: pointer } : {}),
      },
    };
  });
}
