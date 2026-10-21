// Paying a moon owner (issue #4514, spec #4504): record a payout, mark a journal row "not a
// payout", and attach the wallet journal's outgoing donation to the record by amount, date and
// recipient (an unmatched one is recorded). Officer-only; the same live role check as the other
// moon owner writes. Failures carry a stable `reason`; no player-facing text lives here.
// Payouts never touch Tax Payment matching or Statements.

import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';
import { boundedString, record } from './communities.js';
import { FEEDERS, parseBookCall, utcDate, type BookCall } from './corpTaxBook.js';
import {
  buildRecordedPayout,
  reconcileOutgoing,
  type FeederPayout,
  type OutgoingDonation,
} from './corpTaxBookEngine.js';
import { tryRebuildFeederView } from './corpTaxBookFeederView.js';
import type { FeederRecord } from './corpTaxBookFeeders.js';
import {
  appendAudit,
  authorizeOfficer,
  bookRef,
  type BookDeps,
  type Caller,
} from './corpTaxBookStore.js';

export const PAYOUTS = 'payouts';
export const MAX_OUTGOING = 500;

function fail(code: FunctionsErrorCode, message: string, reason: string): never {
  throw new HttpsError(code, message, { reason });
}

// --- Input -----------------------------------------------------------------

interface FeederTargetCall extends BookCall {
  feederCorporationId: number;
}

function parseTarget(data: unknown): FeederTargetCall {
  const id = record(data).feederCorporationId;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
    throw new HttpsError('invalid-argument', 'feederCorporationId must be a corporation id');
  }
  return { ...parseBookCall(data), feederCorporationId: id };
}

export interface RecordPayoutInput extends FeederTargetCall {
  amount: number;
  date: string;
  method: 'donation' | 'contract' | 'other';
}

export function parseRecordPayoutInput(data: unknown): RecordPayoutInput {
  const target = parseTarget(data);
  const d = record(data);
  if (d.method !== 'donation' && d.method !== 'contract' && d.method !== 'other') {
    throw new HttpsError('invalid-argument', 'method must be donation, contract or other');
  }
  const date = boundedString(d.date, 'date', 10);
  try {
    buildRecordedPayout({ amount: d.amount as number, date, method: d.method });
  } catch (e) {
    throw new HttpsError('invalid-argument', e instanceof Error ? e.message : 'bad payout');
  }
  return { ...target, amount: d.amount as number, date, method: d.method };
}

export interface MarkPayoutInput extends FeederTargetCall {
  payoutId: string;
  notAPayout: boolean;
}

export function parseMarkPayoutInput(data: unknown): MarkPayoutInput {
  const target = parseTarget(data);
  const d = record(data);
  if (typeof d.notAPayout !== 'boolean') {
    throw new HttpsError('invalid-argument', 'notAPayout must be true or false');
  }
  return {
    ...target,
    payoutId: boundedString(d.payoutId, 'payoutId', 64),
    notAPayout: d.notAPayout,
  };
}

export interface ReconcilePayoutsInput extends BookCall {
  outgoing: OutgoingDonation[];
}

export function parseReconcilePayoutsInput(data: unknown): ReconcilePayoutsInput {
  const call = parseBookCall(data);
  const list = record(data).outgoing;
  if (!Array.isArray(list) || list.length > MAX_OUTGOING) {
    throw new HttpsError('invalid-argument', `outgoing must be a list of up to ${MAX_OUTGOING}`);
  }
  const outgoing = list.map((raw): OutgoingDonation => {
    const r = record(raw);
    const ints = ['refId', 'division', 'recipientId', 'amount'] as const;
    for (const key of ints) {
      const v = r[key];
      if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
        throw new HttpsError('invalid-argument', `${key} must be a whole number`);
      }
    }
    const at = boundedString(r.at, 'at', 40);
    if (Number.isNaN(Date.parse(at))) throw new HttpsError('invalid-argument', 'at must be a date');
    return {
      refId: r.refId as number,
      division: r.division as number,
      recipientId: r.recipientId as number,
      amount: r.amount as number,
      at: new Date(at).toISOString(),
    };
  });
  return { ...call, outgoing };
}

// --- Calls -----------------------------------------------------------------

const payoutsOf = (deps: BookDeps, collector: number, feeder: number) =>
  bookRef(deps.db, collector).collection(FEEDERS).doc(String(feeder)).collection(PAYOUTS);

/** The ids a donation to this moon owner may go to: its payee, else the corporation itself. */
export function payeeIdsOf(rec: Pick<FeederRecord, 'corporationId' | 'payee'>): Set<number> {
  return new Set([rec.payee?.id ?? rec.corporationId]);
}

/** "I've sent it" (or added by hand): records the payout at once. The journal attaches to it later. */
export async function recordFeederPayout(
  deps: BookDeps,
  caller: Caller,
  input: RecordPayoutInput
): Promise<{ id: string }> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  const feeder = bookRef(deps.db, input.corporationId)
    .collection(FEEDERS)
    .doc(String(input.feederCorporationId));
  const payout = buildRecordedPayout(input);
  const ref = payoutsOf(deps, input.corporationId, input.feederCorporationId).doc();
  await deps.db.runTransaction(async (tx) => {
    if (!(await tx.get(feeder)).exists) fail('not-found', 'No such moon owner', 'no-feeder');
    tx.create(ref, payout);
    appendAudit(
      tx,
      deps,
      input.corporationId,
      { characterId: access.characterId, name: access.characterName },
      'feederPayoutRecorded',
      {
        feederCorporationId: input.feederCorporationId,
        amount: payout.amount,
        date: payout.date,
        method: payout.method,
      }
    );
  });
  await tryRebuildFeederView(deps, input.corporationId, input.feederCorporationId);
  return { id: ref.id };
}

/** An officer says a detected (or recorded) row is, or is not, a payout. It keeps its journal ref so it is never re-detected. */
export async function markFeederPayout(
  deps: BookDeps,
  caller: Caller,
  input: MarkPayoutInput
): Promise<{ ok: true }> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  const ref = payoutsOf(deps, input.corporationId, input.feederCorporationId).doc(input.payoutId);
  await deps.db.runTransaction(async (tx) => {
    if (!(await tx.get(ref)).exists) fail('not-found', 'No such payment', 'no-payout');
    tx.update(ref, { notAPayout: input.notAPayout });
    appendAudit(
      tx,
      deps,
      input.corporationId,
      { characterId: access.characterId, name: access.characterName },
      'feederPayoutMarked',
      {
        feederCorporationId: input.feederCorporationId,
        payoutId: input.payoutId,
        notAPayout: input.notAPayout,
      }
    );
  });
  await tryRebuildFeederView(deps, input.corporationId, input.feederCorporationId);
  return { ok: true };
}

/**
 * Attach the book's outgoing donations to its moon owners' payouts, and record the ones nobody
 * did. Needs no caller: the scheduled sync calls it with the journal it just read; the callable
 * below calls it for an officer's browser sync. Idempotent (a journal entry counts once).
 */
export async function reconcileFeederPayouts(
  deps: BookDeps,
  collector: number,
  outgoing: readonly OutgoingDonation[]
): Promise<{ attached: number; recorded: number }> {
  if (outgoing.length === 0) return { attached: 0, recorded: 0 };
  const feeders = await bookRef(deps.db, collector).collection(FEEDERS).get();
  let attached = 0;
  let recorded = 0;
  for (const doc of feeders.docs) {
    const rec = doc.data() as FeederRecord;
    const col = payoutsOf(deps, collector, Number(doc.id));
    const stored = (await col.get()).docs.map((d) => ({
      ...(d.data() as FeederPayout),
      notAPayout: d.get('notAPayout') === true,
      id: d.id,
    }));
    const first = rec.coveragePeriods.map((p) => p.from).sort()[0] ?? utcDate(rec.joinedAt);
    const { attach, create } = reconcileOutgoing({
      payouts: stored,
      outgoing,
      payeeIds: payeeIdsOf({ ...rec, corporationId: Number(doc.id) }),
      since: first,
    });
    if (attach.length + create.length === 0) continue;
    const batch = deps.db.batch();
    for (const a of attach) {
      batch.update(col.doc(a.id), { status: 'matched', journalRef: a.journalRef });
    }
    for (const c of create) batch.set(col.doc(c.id), c.payout);
    await batch.commit();
    attached += attach.length;
    recorded += create.length;
    await tryRebuildFeederView(deps, collector, Number(doc.id));
  }
  return { attached, recorded };
}

/** The officer's browser sync hands over what its journal read found. */
export async function reconcileFeederPayoutsCall(
  deps: BookDeps,
  caller: Caller,
  input: ReconcilePayoutsInput
): Promise<{ attached: number; recorded: number }> {
  await authorizeOfficer(deps, caller, input, 'edit', { live: false });
  return reconcileFeederPayouts(deps, input.corporationId, input.outgoing);
}
