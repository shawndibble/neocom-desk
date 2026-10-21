// Collector books: the moon owner's side of onboarding (issue #4511, spec #4504).
// Three callables' logic:
//
//   saveFeederGrant   a separate SSO login by the Accountant alt, mining scope only
//                     (FEEDER_SYNC_SCOPES): accept the invite, store the offline grant,
//                     run the first pull. The ledger read's 403 is the role check
//                     (decision 20261020-141656), so a non-Accountant alt unwinds
//                     everything and the invite stays usable.
//   leaveFeeder       holder, CEO or Director ends the feed at once.
//   feederStatus      what a moon owner's officers see of their own feed.
//
// Failures carry a stable `reason` for the UI to map; no player-facing text lives here.
// No token is logged or returned.

import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { boundedString, record } from './communities.js';
import { encryptRefreshToken } from './alertGrantCrypto.js';
import type { RefreshedTokens } from './alertGrant.js';
import {
  grantRef,
  revokeStored,
  syncOneFeeder,
  type CorpSyncDeps,
  type CorpSyncGrantDoc,
} from './corpSyncGrant.js';
import {
  FEEDERS,
  FEEDER_INVITES_COLLECTION,
  FEEDER_OF_COLLECTION,
  FEEDER_PREVIOUS_COLLECTION,
  OBSERVED,
  REMOVAL_LINKS_COLLECTION,
  decideRoles,
  utcDate,
} from './corpTaxBook.js';
import { FEEDER_SYNC_SCOPES } from './corpSyncScopes.js';
import { closePeriod, isDayCovered, reopenPeriod } from './corpTaxBookEngine.js';
import { ROLES_SCOPE, type CorporationLookup } from './corpTaxBookEsi.js';
import {
  acceptInviteCore,
  type AcceptFeederInviteResult,
  type AcceptUndo,
  type FeederRecord,
} from './corpTaxBookFeeders.js';
import {
  appendRequestedRate,
  feederViewRef,
  tryRebuildFeederView,
} from './corpTaxBookFeederView.js';
import { appendAudit, bookRef, type BookDeps, type Caller } from './corpTaxBookStore.js';
import type { SyncEsi } from './corpTaxBookSyncEsi.js';
import { characterIdForUid, type EveTokenClaims } from './verifyEveToken.js';

export interface FeederGrantDeps extends CorpSyncDeps {
  esi: SyncEsi;
  /** Public lookup of a Character's corporation (the alt's token has no roles scope). */
  lookupCorporation: CorporationLookup;
}

const PURPOSE = 'corpSyncGrant' as const;

const bookDeps = (deps: CorpSyncDeps): BookDeps => ({
  db: deps.db,
  now: deps.now,
  verifyToken: deps.verify,
  readIdentity: deps.readIdentity,
  ...(deps.openPrices ? { openPrices: deps.openPrices } : {}),
});

function fail(
  code: ConstructorParameters<typeof HttpsError>[0],
  message: string,
  reason: string
): never {
  throw new HttpsError(code, message, { reason });
}

// --- Input -----------------------------------------------------------------

export interface SaveFeederGrantInput {
  code: string;
  accessToken: string;
  refreshToken: string;
  /** What the moon owner asks to be paid (0-100); absent when left blank. */
  requestedRatePct?: number;
}

export function parseSaveFeederGrantInput(data: unknown): SaveFeederGrantInput {
  const d = record(data);
  const out: SaveFeederGrantInput = {
    code: boundedString(d.code, 'code', 64),
    accessToken: boundedString(d.accessToken, 'accessToken', 8192),
    refreshToken: boundedString(d.refreshToken, 'refreshToken', 8192),
  };
  const rate = d.requestedRatePct;
  if (rate !== undefined && rate !== null) {
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 100) {
      throw new HttpsError('invalid-argument', 'requestedRatePct must be 0-100');
    }
    out.requestedRatePct = rate;
  }
  return out;
}

export interface FeederCall {
  corporationId: number;
  /** The caller's own token carrying the corporation roles scope. */
  accessToken: string;
}

export function parseFeederCall(data: unknown): FeederCall {
  const d = record(data);
  const corporationId = d.corporationId;
  if (
    typeof corporationId !== 'number' ||
    !Number.isSafeInteger(corporationId) ||
    corporationId <= 0
  ) {
    throw new HttpsError('invalid-argument', 'corporationId must be a positive integer');
  }
  return { corporationId, accessToken: boundedString(d.accessToken, 'accessToken', 8192) };
}

// --- Save ------------------------------------------------------------------

export type SaveFeederGrantResult = AcceptFeederInviteResult;

function verifyFeederToken(claims: EveTokenClaims): void {
  const [only] = FEEDER_SYNC_SCOPES;
  if (!claims.scopes.includes(only)) {
    fail('failed-precondition', 'Grant the corporation mining scope first', 'missing-scope');
  }
  if (claims.scopes.length !== FEEDER_SYNC_SCOPES.length) {
    fail('permission-denied', 'Token must carry only the mining scope', 'wrong-scopes');
  }
}

async function verifiedClaims(deps: CorpSyncDeps, accessToken: string): Promise<EveTokenClaims> {
  try {
    return await deps.verify(accessToken);
  } catch {
    throw new HttpsError('unauthenticated', 'EVE access token rejected');
  }
}

/** The code Reconnect sends in place of an invite: rebind the grant of a corporation that already feeds a book. */
export const RECONNECT_CODE = 'reconnect-existing';

const RECONNECTABLE: readonly FeederRecord['status'][] = [
  'active',
  'pending-removal',
  'disconnected',
];

async function reconnectCore(
  deps: BookDeps,
  feederCorp: number,
  holder: number,
  grantedBy: number
): Promise<AcceptFeederInviteResult & { priorRecord: FeederRecord }> {
  const pointer = (
    await deps.db.collection(FEEDER_OF_COLLECTION).doc(String(feederCorp)).get()
  ).data();
  const collector = pointer?.collectorCorporationId;
  if (typeof collector !== 'number') {
    fail('failed-precondition', 'This corporation is not feeding a book', 'not-your-feeder');
  }
  const ref = bookRef(deps.db, collector).collection(FEEDERS).doc(String(feederCorp));
  const rec = (await ref.get()).data() as FeederRecord | undefined;
  if (!rec || !RECONNECTABLE.includes(rec.status)) {
    fail('failed-precondition', 'This corporation is not feeding a book', 'not-your-feeder');
  }
  const patch: Record<string, unknown> = { grantHolder: holder, grantedBy };
  if (rec.status === 'disconnected') {
    // Back after a disconnect: a new coverage period, the balance and rate history carry on.
    patch.status = 'active';
    patch.coveragePeriods = reopenPeriod(rec.coveragePeriods, utcDate(deps.now()));
    patch.disconnectedAt = FieldValue.delete();
    patch.staleSince = FieldValue.delete();
  }
  await ref.update(patch);
  return {
    collectorCorporationId: collector,
    feederCorporationId: feederCorp,
    rejoined: false,
    priorRecord: rec,
  };
}

export async function saveFeederGrant(
  deps: FeederGrantDeps,
  caller: Caller,
  input: SaveFeederGrantInput
): Promise<SaveFeederGrantResult> {
  const callerId = characterIdForUid(caller.uid);
  if (callerId === undefined) {
    fail('unauthenticated', 'Sign in with a Character first', 'not-signed-in');
  }
  // The alt need not be on the caller's account, so the token's Character is not
  // compared with the caller; the refresh token must be the same alt's, below.
  const supplied = await verifiedClaims(deps, input.accessToken);
  verifyFeederToken(supplied);

  let refreshed: RefreshedTokens;
  try {
    refreshed = await deps.refresh(supplied.clientId, input.refreshToken);
  } catch (err) {
    deps.log('Feeder grant refresh token rejected', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    throw new HttpsError('unauthenticated', 'EVE refresh token rejected');
  }
  // From here the rotated token is live at SSO: any failure must revoke it.
  const orphan = async () => {
    try {
      await deps.revoke(supplied.clientId, refreshed.refreshToken);
    } catch {
      deps.log('Feeder grant token revoke failed after a refused save');
    }
  };

  let undo: AcceptUndo | undefined;
  let accepted: (AcceptFeederInviteResult & { undo?: AcceptUndo }) | undefined;
  let reconnectPrior: FeederRecord | undefined;
  try {
    const claims = await verifiedClaims(deps, refreshed.accessToken);
    if (claims.characterId !== supplied.characterId) {
      fail('permission-denied', 'Refresh token belongs to another Character', 'token-mismatch');
    }
    verifyFeederToken(claims);
    const feederCorp = await deps.lookupCorporation(claims.characterId);

    accepted =
      input.code === RECONNECT_CODE
        ? await reconnectCore(bookDeps(deps), feederCorp, claims.characterId, callerId)
        : await acceptInviteCore(bookDeps(deps), {
            code: input.code,
            characterId: claims.characterId,
            name: claims.name,
            feederCorp,
            recordExtra: { grantHolder: claims.characterId, grantedBy: callerId },
          });
    undo = accepted.undo;
    if ('priorRecord' in accepted) reconnectPrior = accepted.priorRecord as FeederRecord;

    const now = deps.now();
    const doc: CorpSyncGrantDoc = {
      corporationId: feederCorp,
      characterId: claims.characterId,
      characterName: claims.name,
      encryptedRefreshToken: encryptRefreshToken(
        refreshed.refreshToken,
        claims.characterId,
        deps.key(),
        PURPOSE
      ),
      clientId: claims.clientId,
      enabledAt: now,
      kind: 'feeder',
      collectorCorporationId: accepted.collectorCorporationId,
      grantedBy: callerId,
    };
    await grantRef(deps.db, feederCorp).set(doc);

    const first = await syncOneFeeder(deps, deps.esi, accepted.collectorCorporationId, feederCorp);
    // A refused first pull means the alt is not an Accountant (or lost the role at once).
    if (first.outcome === 'stale') {
      fail(
        'permission-denied',
        'That Character cannot read the corporation ledger',
        'not-an-accountant'
      );
    }
  } catch (err) {
    if (undo && accepted) {
      await unwindAccept(
        deps,
        accepted.feederCorporationId,
        accepted.collectorCorporationId,
        undo,
        {
          characterId: callerId,
        }
      );
    }
    if (reconnectPrior && accepted) {
      // A refused reconnect puts the record back and drops the grant it just stored.
      await bookRef(deps.db, accepted.collectorCorporationId)
        .collection(FEEDERS)
        .doc(String(accepted.feederCorporationId))
        .set(reconnectPrior);
      await grantRef(deps.db, accepted.feederCorporationId).delete();
    }
    await orphan();
    throw err;
  }

  if (input.requestedRatePct !== undefined) {
    // A blank rate is a complete grant, so a rate that fails to save never fails it.
    try {
      const ref = bookRef(deps.db, accepted.collectorCorporationId)
        .collection(FEEDERS)
        .doc(String(accepted.feederCorporationId));
      const rec = (await ref.get()).data() as FeederRecord | undefined;
      await ref.update({
        requestedRatePct: input.requestedRatePct,
        ...(rec
          ? { ownerRateHistory: appendRequestedRate(rec, input.requestedRatePct, deps.now()) }
          : {}),
      });
    } catch (e) {
      console.error('feeder requested rate not saved', e instanceof Error ? e.message : e);
    }
  }
  await tryRebuildFeederView(
    bookDeps(deps),
    accepted.collectorCorporationId,
    accepted.feederCorporationId
  );
  return {
    collectorCorporationId: accepted.collectorCorporationId,
    feederCorporationId: accepted.feederCorporationId,
    rejoined: accepted.rejoined,
  };
}

/** Put the feeder record, pointer, invite and grant back to how they were before the accept. */
async function unwindAccept(
  deps: FeederGrantDeps,
  feederCorp: number,
  collector: number,
  undo: AcceptUndo,
  actor: { characterId: number }
): Promise<void> {
  const grantSnap = await grantRef(deps.db, feederCorp).get();
  const held = grantSnap.data() as CorpSyncGrantDoc | undefined;
  const feederRef = bookRef(deps.db, collector).collection(FEEDERS).doc(String(feederCorp));
  await deps.db.runTransaction(async (tx) => {
    if (undo.priorRecord) tx.set(feederRef, undo.priorRecord);
    else tx.delete(feederRef);
    tx.delete(deps.db.collection(FEEDER_OF_COLLECTION).doc(String(feederCorp)));
    tx.update(deps.db.collection(FEEDER_INVITES_COLLECTION).doc(undo.inviteId), {
      acceptedBy: FieldValue.delete(),
      acceptedAt: FieldValue.delete(),
      acceptedByCorporationId: FieldValue.delete(),
    });
    if (held && held.kind === 'feeder') tx.delete(grantRef(deps.db, feederCorp));
    appendAudit(
      tx,
      bookDeps(deps),
      collector,
      { characterId: actor.characterId, name: 'Moon owner setup' },
      'feederJoinUndone',
      { feederCorporationId: feederCorp, inviteId: undo.inviteId }
    );
  });
  // The rotated token the sync stored; the caller revokes the originally rotated one.
  if (held && held.kind === 'feeder') await revokeStored(deps, held);
  // The refused first pull rebuilt the view; put it back, or drop it with the record it described.
  try {
    if (undo.priorRecord) await tryRebuildFeederView(bookDeps(deps), collector, feederCorp);
    else await deps.db.recursiveDelete(feederViewRef(deps.db, collector, feederCorp));
  } catch (e) {
    console.error('feeder view not restored', e instanceof Error ? e.message : e);
  }
}

// --- Standing --------------------------------------------------------------

export interface FeederContext {
  callerId: number;
  collectorCorporationId: number;
  record: FeederRecord;
  grant: CorpSyncGrantDoc | undefined;
}

/**
 * `view` is the moon owner's own page (issue #4512): CEO, Director or Accountant only, and no
 * holder shortcut, so the role is always live. It also resolves a feeder that has left.
 */
type Standing = 'leave' | 'read' | 'view' | 'edit';

/**
 * Who may act on a feeder from the moon owner's side: the grant holder always, else
 * a live roles check in that corporation (CEO or Director to leave; also an
 * Accountant or Junior Accountant to read).
 */
export async function authorizeFeederCaller(
  deps: CorpSyncDeps,
  caller: Caller,
  input: FeederCall,
  standing: Standing
): Promise<FeederContext | null> {
  const callerId = characterIdForUid(caller.uid);
  if (callerId === undefined) {
    fail('unauthenticated', 'Sign in with a Character first', 'not-signed-in');
  }
  const claims = await verifiedClaims(deps, input.accessToken);
  if (claims.characterId !== callerId || claims.ownerHash !== caller.ownerHash) {
    fail('permission-denied', 'The access token is for a different Character', 'token-mismatch');
  }
  if (!claims.scopes.includes(ROLES_SCOPE)) {
    fail('failed-precondition', 'Grant the corporation roles scope first', 'missing-scope');
  }
  const pointer = (
    await deps.db.collection(FEEDER_OF_COLLECTION).doc(String(input.corporationId)).get()
  ).data();
  let collector = pointer?.collectorCorporationId;
  if (typeof collector !== 'number' && standing === 'view') {
    const previous = (
      await deps.db.collection(FEEDER_PREVIOUS_COLLECTION).doc(String(input.corporationId)).get()
    ).data();
    collector = previous?.collectorCorporationId;
  }
  if (typeof collector !== 'number') return null;
  const [recordSnap, grantSnap] = await Promise.all([
    bookRef(deps.db, collector).collection(FEEDERS).doc(String(input.corporationId)).get(),
    grantRef(deps.db, input.corporationId).get(),
  ]);
  const feeder = recordSnap.data() as FeederRecord | undefined;
  const grant = grantSnap.data() as CorpSyncGrantDoc | undefined;
  if (!feeder) return null;
  const isHolder =
    standing !== 'view' &&
    standing !== 'edit' &&
    (callerId === feeder.grantHolder ||
      callerId === feeder.grantedBy ||
      callerId === grant?.characterId ||
      callerId === grant?.grantedBy);
  if (!isHolder) {
    const identity = await deps.readIdentity(callerId, input.accessToken);
    if (identity.corporationId !== input.corporationId) {
      fail('permission-denied', 'Not a member of this corporation', 'not-your-feeder');
    }
    const roles = decideRoles(identity.roles, identity.ceoId === callerId);
    const allowed =
      standing === 'leave' ? roles.isDirector : standing === 'read' ? roles.canView : roles.canEdit;
    if (!allowed) fail('permission-denied', 'Not allowed for this corporation', 'not-your-feeder');
  }
  return { callerId, collectorCorporationId: collector, record: feeder, grant };
}

// --- Leave -----------------------------------------------------------------

const LEAVABLE: readonly FeederRecord['status'][] = ['active', 'pending-removal', 'disconnected'];

export async function leaveFeeder(
  deps: CorpSyncDeps,
  caller: Caller,
  input: FeederCall
): Promise<{ left: true; owedIsk: number | null }> {
  const ctx = await authorizeFeederCaller(deps, caller, input, 'leave');
  if (!ctx || !LEAVABLE.includes(ctx.record.status)) {
    fail('failed-precondition', 'This corporation is not feeding a book', 'not-your-feeder');
  }
  // Leaving while a removal is pending is the moon owner forcing it: it reads as removed.
  await endFeeder(deps, {
    collectorCorporationId: ctx.collectorCorporationId,
    feederCorporationId: input.corporationId,
    effectiveAt: deps.now(),
    finalStatus: ctx.record.status === 'pending-removal' ? 'removed' : 'left',
    actor: { characterId: ctx.callerId, name: 'Moon owner' },
    action: ctx.record.status === 'pending-removal' ? 'feederRemovalForced' : 'feederLeft',
    allowed: LEAVABLE,
  });
  // No server-side accrual engine yet (#4510 is client-side): the balance is the client's to show.
  return { left: true, owedIsk: null };
}

export interface EndFeederInput {
  collectorCorporationId: number;
  feederCorporationId: number;
  /** Coverage ends the day before this moment's UTC day. */
  effectiveAt: number;
  finalStatus: 'left' | 'removed';
  actor: { characterId: number | null; name: string; via?: string };
  action: string;
  /** The statuses this may end; anything else is refused. */
  allowed: readonly FeederRecord['status'][];
}

/**
 * Ends a feeder: the record, its pointer, its grant and its coverage, then the view. Leave,
 * a forced removal and a removal taking effect differ only in `finalStatus`, `effectiveAt`
 * and the audit entry.
 */
export async function endFeeder(deps: CorpSyncDeps, input: EndFeederInput): Promise<void> {
  const { collectorCorporationId: collector, feederCorporationId: feederCorp } = input;
  const feederRef = bookRef(deps.db, collector).collection(FEEDERS).doc(String(feederCorp));
  const pointerRef = deps.db.collection(FEEDER_OF_COLLECTION).doc(String(feederCorp));
  const previousRef = deps.db.collection(FEEDER_PREVIOUS_COLLECTION).doc(String(feederCorp));
  const gRef = grantRef(deps.db, feederCorp);
  const now = deps.now();

  const dropped = await deps.db.runTransaction(async (tx) => {
    const [recSnap, ptrSnap, grantSnap] = await Promise.all([
      tx.get(feederRef),
      tx.get(pointerRef),
      tx.get(gRef),
    ]);
    const rec = recSnap.data() as FeederRecord | undefined;
    if (!rec || !ptrSnap.exists || !input.allowed.includes(rec.status)) {
      fail('failed-precondition', 'This corporation is not feeding a book', 'not-your-feeder');
    }
    const grant = grantSnap.data() as CorpSyncGrantDoc | undefined;
    tx.update(feederRef, {
      status: input.finalStatus,
      leftAt: now,
      coveragePeriods: closePeriod(rec.coveragePeriods, utcDate(input.effectiveAt)),
      removal: FieldValue.delete(),
      removalLinkId: FieldValue.delete(),
    });
    if (rec.removalLinkId) {
      tx.delete(deps.db.collection(REMOVAL_LINKS_COLLECTION).doc(rec.removalLinkId));
    }
    tx.delete(pointerRef);
    // The after-leaving view still finds its Collector through this.
    tx.set(previousRef, { collectorCorporationId: collector, leftAt: now });
    if (grant?.kind === 'feeder') tx.delete(gRef);
    appendAudit(tx, bookDeps(deps), collector, input.actor, input.action, {
      feederCorporationId: feederCorp,
    });
    return grant?.kind === 'feeder' ? grant : undefined;
  });
  if (dropped) await revokeStored(deps, dropped);
  await tryRebuildFeederView(bookDeps(deps), collector, feederCorp);
}

// --- Status ----------------------------------------------------------------

export interface FeederRefinery {
  structureId: number;
  label: string | null;
  /** Units mined at this refinery inside coverage. */
  volume: number;
}

export type FeederStatusResult =
  | { status: 'none' }
  | {
      status: 'feeder';
      collectorCorporationId: number;
      collectorName: string | null;
      feederStatus: FeederRecord['status'];
      lastReadWellAt: number | null;
      lastSyncResult: string | null;
      requestedRatePct: number | null;
      effectiveRatePct: number | null;
      isHolder: boolean;
      refineries: FeederRefinery[];
      owedIsk: number | null;
    };

/** Most observed rows one status call reads; a feeder with more shows the newest slice. */
export const STATUS_ROW_LIMIT = 20_000;

/** Sum mined quantity per refinery over covered days only. Pure. */
export function aggregateRefineries(
  rows: readonly { structureId: number; date: string; quantity: number }[],
  periods: FeederRecord['coveragePeriods']
): FeederRefinery[] {
  const byStructure = new Map<number, number>();
  for (const r of rows) {
    if (!isDayCovered(periods, r.date)) continue;
    byStructure.set(r.structureId, (byStructure.get(r.structureId) ?? 0) + r.quantity);
  }
  return [...byStructure]
    .map(([structureId, volume]) => ({ structureId, label: null, volume }))
    .sort((a, b) => b.volume - a.volume || a.structureId - b.structureId);
}

export async function getFeederStatus(
  deps: CorpSyncDeps,
  caller: Caller,
  input: FeederCall
): Promise<FeederStatusResult> {
  const ctx = await authorizeFeederCaller(deps, caller, input, 'read');
  if (!ctx) return { status: 'none' };
  const { record: rec, collectorCorporationId: collector } = ctx;
  const [book, observed] = await Promise.all([
    bookRef(deps.db, collector).get(),
    bookRef(deps.db, collector)
      .collection(OBSERVED)
      .where('sourceCorporationId', '==', input.corporationId)
      .select('structureId', 'date', 'quantity')
      .limit(STATUS_ROW_LIMIT)
      .get(),
  ]);
  const name = book.get('corporationName');
  const rows = observed.docs.map(
    (d) => d.data() as { structureId: number; date: string; quantity: number }
  );
  const effective = rec.agreedRatePct ?? rec.requestedRatePct ?? null;
  const last = rec.lastSyncResult;
  return {
    status: 'feeder',
    collectorCorporationId: collector,
    collectorName: typeof name === 'string' ? name : null,
    feederStatus: rec.status,
    lastReadWellAt: rec.lastReadWellAt ?? null,
    lastSyncResult: last ? (last.reason ? `${last.outcome}:${last.reason}` : last.outcome) : null,
    requestedRatePct: rec.requestedRatePct ?? null,
    effectiveRatePct: effective,
    isHolder:
      ctx.callerId === rec.grantHolder ||
      ctx.callerId === rec.grantedBy ||
      ctx.callerId === ctx.grant?.characterId ||
      ctx.callerId === ctx.grant?.grantedBy,
    refineries: aggregateRefineries(rows, rec.coveragePeriods),
    owedIsk: null,
  };
}
