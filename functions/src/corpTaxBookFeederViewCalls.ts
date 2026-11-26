import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { fail, type Caller } from './actorAuth.js';
import { boundedString, record } from './communities.js';
import { ACCESS_TTL_MS, pctField } from './corpTaxBook.js';
import { type CorpSyncDeps } from './corpSyncGrant.js';
import {
  authorizeFeederCaller,
  parseFeederCall,
  type FeederCall,
} from './corpTaxBookFeederGrant.js';
import {
  FEEDER_VIEW_VIEWERS,
  appendRequestedRate,
  feederViewRef,
  tryRebuildFeederView,
  type FeederViewAccessResult,
  type FeederViewerAccess,
} from './corpTaxBookFeederView.js';
import { PAYOUTS } from './corpTaxBookFeederPayouts.js';
import type { FeederRecord } from './corpTaxBookFeeders.js';
import { appendAudit, feederRef, type BookDeps } from './corpTaxBookStore.js';
import { refreshSharedPops } from './sharedPopsStore.js';

export { parseFeederCall };

export const feederBookDeps = (deps: CorpSyncDeps): BookDeps => ({
  db: deps.db,
  now: deps.now,
  verifyToken: deps.verify,
  readIdentity: deps.readIdentity,
  ...(deps.openPrices ? { openPrices: deps.openPrices } : {}),
  ...(deps.corporationAlliance ? { corporationAlliance: deps.corporationAlliance } : {}),
});

export interface RequestFeederRateInput extends FeederCall {
  pct: number;
}

export function parseRequestFeederRateInput(data: unknown): RequestFeederRateInput {
  const call = parseFeederCall(data);
  return { ...call, pct: pctField(record(data).pct, 'pct') };
}

export async function getFeederViewAccess(
  deps: CorpSyncDeps,
  caller: Caller,
  input: FeederCall
): Promise<FeederViewAccessResult> {
  const ctx = await authorizeFeederCaller(deps, caller, input, 'view');
  if (!ctx)
    fail('failed-precondition', 'This corporation has no moon owner view', 'not-your-feeder');
  const now = deps.now();
  const access: FeederViewerAccess = {
    uid: caller.uid,
    characterId: ctx.callerId,
    ownerHash: caller.ownerHash,
    corporationId: input.corporationId,
    canView: true,
    canEdit: true,
    checkedAt: now,
    expiresAt: now + ACCESS_TTL_MS,
  };
  const view = feederViewRef(deps.db, ctx.collectorCorporationId, input.corporationId);
  await view.collection(FEEDER_VIEW_VIEWERS).doc(caller.uid).set(access);
  if (!(await view.get()).exists) {
    await tryRebuildFeederView(
      feederBookDeps(deps),
      ctx.collectorCorporationId,
      input.corporationId
    );
  }
  return {
    collectorCorporationId: ctx.collectorCorporationId,
    expiresAt: access.expiresAt,
    canEdit: access.canEdit,
  };
}

export async function requestFeederRate(
  deps: CorpSyncDeps,
  caller: Caller,
  input: RequestFeederRateInput
): Promise<{ ok: true }> {
  const ctx = await authorizeFeederCaller(deps, caller, input, 'edit');
  if (!ctx)
    fail('failed-precondition', 'This corporation is not feeding a book', 'not-your-feeder');
  const ref = feederRef(deps.db, ctx.collectorCorporationId, input.corporationId);
  await deps.db.runTransaction(async (tx) => {
    const rec = (await tx.get(ref)).data() as FeederRecord | undefined;
    if (!rec || (rec.status !== 'active' && rec.status !== 'pending-removal')) {
      fail('failed-precondition', 'This corporation is not feeding a book', 'not-your-feeder');
    }
    tx.update(ref, {
      requestedRatePct: input.pct,
      ownerRateHistory: appendRequestedRate(rec, input.pct, deps.now()),
    });
    appendAudit(
      tx,
      feederBookDeps(deps),
      ctx.collectorCorporationId,
      { characterId: ctx.callerId, name: 'Moon owner' },
      'feederRateRequested',
      { feederCorporationId: input.corporationId, pct: input.pct }
    );
  });
  await tryRebuildFeederView(feederBookDeps(deps), ctx.collectorCorporationId, input.corporationId);
  return { ok: true };
}

export interface DisputeFeederPayoutInput extends FeederCall {
  payoutId: string;
  disputed: boolean;
}

export function parseDisputeFeederPayoutInput(data: unknown): DisputeFeederPayoutInput {
  const call = parseFeederCall(data);
  const d = record(data);
  if (typeof d.disputed !== 'boolean') {
    throw new HttpsError('invalid-argument', 'disputed must be true or false');
  }
  return { ...call, payoutId: boundedString(d.payoutId, 'payoutId', 64), disputed: d.disputed };
}

export async function disputeFeederPayout(
  deps: CorpSyncDeps,
  caller: Caller,
  input: DisputeFeederPayoutInput
): Promise<{ ok: true }> {
  const ctx = await authorizeFeederCaller(deps, caller, input, 'edit');
  if (!ctx)
    fail('failed-precondition', 'This corporation has no moon owner view', 'not-your-feeder');
  const ref = feederRef(deps.db, ctx.collectorCorporationId, input.corporationId)
    .collection(PAYOUTS)
    .doc(input.payoutId);
  const changed = await deps.db.runTransaction(async (tx) => {
    const row = await tx.get(ref);
    if (!row.exists || row.get('notAPayout') === true)
      fail('not-found', 'No such payment', 'no-payout');
    if ((row.get('disputedAt') !== undefined) === input.disputed) return false;
    tx.update(ref, { disputedAt: input.disputed ? deps.now() : FieldValue.delete() });
    appendAudit(
      tx,
      feederBookDeps(deps),
      ctx.collectorCorporationId,
      { characterId: ctx.callerId, name: 'Moon owner' },
      'feederPayoutDisputed',
      {
        feederCorporationId: input.corporationId,
        payoutId: input.payoutId,
        disputed: input.disputed,
      }
    );
    return true;
  });
  if (changed)
    await tryRebuildFeederView(
      feederBookDeps(deps),
      ctx.collectorCorporationId,
      input.corporationId
    );
  return { ok: true };
}

export interface SetFeederPopSharingInput extends FeederCall {
  share: boolean;
}

export function parseSetFeederPopSharingInput(data: unknown): SetFeederPopSharingInput {
  const call = parseFeederCall(data);
  const d = record(data);
  if (typeof d.share !== 'boolean') {
    throw new HttpsError('invalid-argument', 'share must be true or false');
  }
  return { ...call, share: d.share };
}

export async function setFeederPopSharing(
  deps: CorpSyncDeps,
  caller: Caller,
  input: SetFeederPopSharingInput
): Promise<{ ok: true }> {
  const ctx = await authorizeFeederCaller(deps, caller, input, 'edit');
  if (!ctx)
    fail('failed-precondition', 'This corporation is not feeding a book', 'not-your-feeder');
  const ref = feederRef(deps.db, ctx.collectorCorporationId, input.corporationId);
  const changed = await deps.db.runTransaction(async (tx) => {
    const rec = (await tx.get(ref)).data() as FeederRecord | undefined;
    if (!rec || (rec.status !== 'active' && rec.status !== 'pending-removal')) {
      fail('failed-precondition', 'This corporation is not feeding a book', 'not-your-feeder');
    }
    if ((rec.popSharingOptOut === undefined) === input.share) return false;
    tx.update(ref, {
      popSharingOptOut: input.share ? FieldValue.delete() : { by: ctx.callerId, at: deps.now() },
    });
    appendAudit(
      tx,
      feederBookDeps(deps),
      ctx.collectorCorporationId,
      { characterId: ctx.callerId, name: 'Moon owner' },
      'feederPopSharingSet',
      { feederCorporationId: input.corporationId, share: input.share }
    );
    return true;
  });
  if (changed) {
    await tryRebuildFeederView(
      feederBookDeps(deps),
      ctx.collectorCorporationId,
      input.corporationId
    );
    await refreshSharedPops(feederBookDeps(deps), ctx.collectorCorporationId);
  }
  return { ok: true };
}

const ENDED: readonly FeederRecord['status'][] = ['left', 'removed', 'disconnected'];

export async function dismissFeederHistory(
  deps: CorpSyncDeps,
  caller: Caller,
  input: FeederCall
): Promise<{ ok: true }> {
  const ctx = await authorizeFeederCaller(deps, caller, input, 'view');
  if (!ctx)
    fail('failed-precondition', 'This corporation has no moon owner view', 'not-your-feeder');
  const ref = feederRef(deps.db, ctx.collectorCorporationId, input.corporationId);
  await deps.db.runTransaction(async (tx) => {
    const rec = (await tx.get(ref)).data() as FeederRecord | undefined;
    if (!rec || !ENDED.includes(rec.status)) {
      fail('failed-precondition', 'This moon owner view is still in use', 'not-ended');
    }
    if (rec.viewDismissedAt !== undefined) return;
    tx.update(ref, { viewDismissedAt: deps.now() });
    appendAudit(
      tx,
      feederBookDeps(deps),
      ctx.collectorCorporationId,
      { characterId: ctx.callerId, name: 'Moon owner' },
      'feederViewDismissed',
      { feederCorporationId: input.corporationId }
    );
  });
  await tryRebuildFeederView(feederBookDeps(deps), ctx.collectorCorporationId, input.corporationId);
  return { ok: true };
}
