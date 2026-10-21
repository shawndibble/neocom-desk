// The moon owner's view callables' logic (issue #4512, spec #4504): the access check, a rate
// request, setting its payee (#4619) and dismissing the after-leaving view. The caller is the moon owner's own officer
// (CEO, Director or Accountant, read live from ESI); the view itself is in
// corpTaxBookFeederView.ts. Failures carry a stable `reason`; no player-facing text lives here.

import { HttpsError } from 'firebase-functions/v2/https';
import { record } from './communities.js';
import { ACCESS_TTL_MS, pctField } from './corpTaxBook.js';
import { type CorpSyncDeps } from './corpSyncGrant.js';
import type { IdCategoryLookup } from './corpTaxBookEsi.js';
import { withPayee, withPayeeChange, type Payee, type PayeeChange } from './corpTaxBookEngine.js';
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
import { appendAudit, fail, feederRef, type BookDeps, type Caller } from './corpTaxBookStore.js';

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

export interface SetFeederPayeeInput extends FeederCall {
  payee: Payee;
}

export function parseSetFeederPayeeInput(data: unknown): SetFeederPayeeInput {
  const call = parseFeederCall(data);
  const { kind, id } = record(record(data).payee);
  if (
    (kind !== 'corporation' && kind !== 'character') ||
    typeof id !== 'number' ||
    !Number.isSafeInteger(id) ||
    id < 1
  ) {
    throw new HttpsError('invalid-argument', 'payee must be a corporation or character id');
  }
  return { ...call, payee: { kind, id } };
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

/**
 * The moon owner names who its money goes to: a corporation or a player. Only its own CEO,
 * Directors and Accountants (live role check); the accounting corporation cannot (#4619).
 * The id is checked against ESI first (#4621). Every set or change stamps `payeeChangedAt` (engine `withPayee`), which the removal's payee
 * link reads, and appends `payeeHistory`, which payout matching reads (#4617).
 */
export async function setFeederPayee(
  deps: CorpSyncDeps,
  caller: Caller,
  input: SetFeederPayeeInput,
  idCategory: IdCategoryLookup
): Promise<{ ok: true }> {
  const ctx = await authorizeFeederCaller(deps, caller, input, 'edit');
  if (!ctx)
    fail('failed-precondition', 'This corporation is not feeding a book', 'not-your-feeder');
  // The id must be the kind it claims (#4621): a character stored as a corporation would send
  // payouts and the removal link to the wrong place. ESI down fails the call; nothing is written.
  if ((await idCategory(input.payee.id)) !== input.payee.kind) {
    fail(
      'invalid-argument',
      'That id is not a corporation or player of that kind',
      'payee-mismatch'
    );
  }
  const ref = feederRef(deps.db, ctx.collectorCorporationId, input.corporationId);
  await deps.db.runTransaction(async (tx) => {
    const rec = (await tx.get(ref)).data() as
      (FeederRecord & { payeeHistory?: PayeeChange[] }) | undefined;
    if (!rec || (rec.status !== 'active' && rec.status !== 'pending-removal')) {
      fail('failed-precondition', 'This corporation is not feeding a book', 'not-your-feeder');
    }
    // Unset means the moon owner corporation: naming it (or the standing payee) changes nothing.
    const current = rec.payee ?? { kind: 'corporation', id: input.corporationId };
    if (current.kind === input.payee.kind && current.id === input.payee.id) return;
    const now = deps.now();
    const next = withPayee(rec, input.payee, now);
    tx.update(ref, {
      payee: input.payee,
      ...(next.payeeChangedAt !== undefined ? { payeeChangedAt: next.payeeChangedAt } : {}),
      payeeHistory: withPayeeChange(rec, input.payee, now),
    });
    appendAudit(
      tx,
      feederBookDeps(deps),
      ctx.collectorCorporationId,
      { characterId: ctx.callerId, name: 'Moon owner' },
      'feederPayeeSet',
      { feederCorporationId: input.corporationId, payee: input.payee }
    );
  });
  await tryRebuildFeederView(feederBookDeps(deps), ctx.collectorCorporationId, input.corporationId);
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
