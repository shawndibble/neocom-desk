// The moon owner's view callables' logic (issue #4512, spec #4504): the access check, a rate
// request and dismissing the after-leaving view; its payee is corpTaxBookPayee.ts (#4653). The
// caller is the moon owner's own officer (CEO, Director or Accountant, read live from ESI); the view itself is in
// corpTaxBookFeederView.ts. Failures carry a stable `reason`; no player-facing text lives here.

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

export { parseFeederCall };

/** The book deps a moon owner's call writes with. */
export const feederBookDeps = (deps: CorpSyncDeps): BookDeps => ({
  db: deps.db,
  now: deps.now,
  verifyToken: deps.verify,
  readIdentity: deps.readIdentity,
  ...(deps.openPrices ? { openPrices: deps.openPrices } : {}),
});

export interface RequestFeederRateInput extends FeederCall {
  /** What the moon owner asks to be paid (0-100). */
  pct: number;
}

export function parseRequestFeederRateInput(data: unknown): RequestFeederRateInput {
  const call = parseFeederCall(data);
  return { ...call, pct: pctField(record(data).pct, 'pct') };
}

/**
 * Live role check, then the 24h access record the rules read. Rebuilds the view when there
 * is none yet. Works after leaving (the `FeederPrevious` pointer), for the after-leaving view.
 */
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

/**
 * The moon owner asks for a rate. Recorded as a `requested` entry dated today; a rate the
 * accounting corporation already agreed keeps winning, so this only moves the effective
 * rate while none is agreed.
 */
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
  /** True flags the payment as disputed; false withdraws the flag. */
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

/**
 * The moon owner flags a payment it disputes (#6209), or withdraws the flag: the accounting
 * corporation's officers see it on the payment. Only a payment that counts can be disputed; the
 * flag changes no figure.
 */
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

const ENDED: readonly FeederRecord['status'][] = ['left', 'removed', 'disconnected'];

/** The moon owner's officers dismiss the after-leaving view; it stays dismissed. */
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
