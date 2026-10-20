// The moon owner's view callables' logic (issue #4512, spec #4504): the access check, a rate
// request and dismissing the after-leaving view. The caller is the moon owner's own officer
// (CEO, Director or Accountant, read live from ESI); the view itself is in
// corpTaxBookFeederView.ts. Failures carry a stable `reason`; no player-facing text lives here.

import { HttpsError } from 'firebase-functions/v2/https';
import { record } from './communities.js';
import { ACCESS_TTL_MS, FEEDERS } from './corpTaxBook.js';
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
import type { FeederRecord } from './corpTaxBookFeeders.js';
import { appendAudit, bookRef, type BookDeps, type Caller } from './corpTaxBookStore.js';

export { parseFeederCall };

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

export interface RequestFeederRateInput extends FeederCall {
  /** What the moon owner asks to be paid (0-100). */
  pct: number;
}

export function parseRequestFeederRateInput(data: unknown): RequestFeederRateInput {
  const call = parseFeederCall(data);
  const pct = record(data).pct;
  if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new HttpsError('invalid-argument', 'pct must be 0-100');
  }
  return { ...call, pct };
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
    await tryRebuildFeederView(bookDeps(deps), ctx.collectorCorporationId, input.corporationId);
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
  const ref = bookRef(deps.db, ctx.collectorCorporationId)
    .collection(FEEDERS)
    .doc(String(input.corporationId));
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
      bookDeps(deps),
      ctx.collectorCorporationId,
      { characterId: ctx.callerId, name: 'Moon owner' },
      'feederRateRequested',
      { feederCorporationId: input.corporationId, pct: input.pct }
    );
  });
  await tryRebuildFeederView(bookDeps(deps), ctx.collectorCorporationId, input.corporationId);
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
  const ref = bookRef(deps.db, ctx.collectorCorporationId)
    .collection(FEEDERS)
    .doc(String(input.corporationId));
  await deps.db.runTransaction(async (tx) => {
    const rec = (await tx.get(ref)).data() as FeederRecord | undefined;
    if (!rec || !ENDED.includes(rec.status)) {
      fail('failed-precondition', 'This moon owner view is still in use', 'not-ended');
    }
    if (rec.viewDismissedAt !== undefined) return;
    tx.update(ref, { viewDismissedAt: deps.now() });
    appendAudit(
      tx,
      bookDeps(deps),
      ctx.collectorCorporationId,
      { characterId: ctx.callerId, name: 'Moon owner' },
      'feederViewDismissed',
      { feederCorporationId: input.corporationId }
    );
  });
  await tryRebuildFeederView(bookDeps(deps), ctx.collectorCorporationId, input.corporationId);
  return { ok: true };
}
