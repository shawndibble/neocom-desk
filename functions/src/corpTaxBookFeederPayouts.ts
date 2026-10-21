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
  outgoingDonationsFromJournal,
  payoutToMerge,
  reconcileBookOutgoing,
  type FeederPayout,
  type OutgoingDonation,
  type OwnerOutgoing,
  type PayeeChange,
} from './corpTaxBookEngine.js';
import { tryRebuildFeederView } from './corpTaxBookFeederView.js';
import type { FeederRecord } from './corpTaxBookFeeders.js';
import {
  SCHEDULED_VIA,
  appendAudit,
  authorizeOfficer,
  bookRef,
  type Actor,
  type BookDeps,
  type Caller,
} from './corpTaxBookStore.js';
import type { SyncEsi } from './corpTaxBookSyncEsi.js';

export const PAYOUTS = 'payouts';

/**
 * Bumped by every transaction that writes a moon owner's payouts. A payouts query does not lock
 * a document id that does not exist yet, so an officer's new record and a journal row created at
 * the same moment would both commit; writing this one field makes them conflict instead.
 */
const PAYOUTS_WRITTEN_AT = 'payoutsWrittenAt';

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

/**
 * The officer's browser sync asks the server to reconcile; the server reads the journal itself.
 * An `outgoing` list a client still sends is ignored: a client-fed row is not the journal.
 */
export type ReconcilePayoutsInput = BookCall;

export function parseReconcilePayoutsInput(data: unknown): ReconcilePayoutsInput {
  return parseBookCall(data);
}

// --- Calls -----------------------------------------------------------------

const payoutsOf = (deps: BookDeps, collector: number, feeder: number) =>
  bookRef(deps.db, collector).collection(FEEDERS).doc(String(feeder)).collection(PAYOUTS);

/** A moon owner record with its payee history (#4617; absent on older records). */
type FeederWithPayees = FeederRecord & { payeeHistory?: PayeeChange[] };

type StoredPayout = FeederPayout & { id: string; confirmedAt?: number };

const storedPayout = (d: FirebaseFirestore.QueryDocumentSnapshot): StoredPayout => ({
  ...(d.data() as FeederPayout & { confirmedAt?: number }),
  notAPayout: d.get('notAPayout') === true,
  id: d.id,
});

/**
 * "I've sent it" (or added by hand): records the payout at once. The journal attaches to it
 * later. When the journal already auto-recorded the same donation, the officer's record confirms
 * that row instead of counting the payment twice (#4617).
 */
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
  const col = payoutsOf(deps, input.corporationId, input.feederCorporationId);
  const fresh = col.doc();
  const id = await deps.db.runTransaction(async (tx) => {
    if (!(await tx.get(feeder)).exists) fail('not-found', 'No such moon owner', 'no-feeder');
    const stored = (await tx.get(col)).docs.map(storedPayout);
    const merge = payoutToMerge(stored, input);
    if (merge) tx.update(col.doc(merge), { confirmedAt: deps.now() });
    else tx.create(fresh, payout);
    tx.update(feeder, { [PAYOUTS_WRITTEN_AT]: deps.now() });
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
        ...(merge ? { journalRow: merge } : {}),
      }
    );
    return merge ?? fresh.id;
  });
  await tryRebuildFeederView(deps, input.corporationId, input.feederCorporationId);
  return { id };
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

/** One moon owner's share of a book-wide reconcile: the journal entries the pass gave it. */
export interface OwnerPayoutPlan {
  owner: Omit<OwnerOutgoing, 'payouts'>;
  /** The entries planned for this owner, attached or recorded. */
  outgoing: OutgoingDonation[];
  /** Of those, the refs planned as new payouts; a planned attach is never turned into one. */
  createRefs: number[];
}

/**
 * Read every moon owner's payouts and decide, book-wide, which journal entry belongs to whom
 * (a journal entry counts for one moon owner only; a donation to a payee two moon owners share is
 * left for an officer to add by hand). Writes nothing.
 */
export async function planFeederPayouts(
  deps: BookDeps,
  collector: number,
  outgoing: readonly OutgoingDonation[]
): Promise<OwnerPayoutPlan[]> {
  if (outgoing.length === 0) return [];
  const feeders = await bookRef(deps.db, collector).collection(FEEDERS).get();
  const owners = await Promise.all(
    feeders.docs.map(async (doc) => {
      const rec = doc.data() as FeederWithPayees;
      const corporationId = Number(doc.id);
      const payouts = (await payoutsOf(deps, collector, corporationId).get()).docs.map(
        storedPayout
      );
      return {
        corporationId,
        ...(rec.payee ? { payee: rec.payee } : {}),
        ...(rec.payeeHistory ? { payeeHistory: rec.payeeHistory } : {}),
        payouts,
        since: rec.coveragePeriods.map((p) => p.from).sort()[0] ?? utcDate(rec.joinedAt),
      };
    })
  );
  const byRef = new Map(outgoing.map((d) => [d.refId, d]));
  return reconcileBookOutgoing({ owners, outgoing }).flatMap(
    ({ corporationId, attach, create }) => {
      if (attach.length + create.length === 0) return [];
      const found = owners.find((o) => o.corporationId === corporationId)!;
      const owner: OwnerPayoutPlan['owner'] = {
        corporationId,
        since: found.since,
        ...(found.payee ? { payee: found.payee } : {}),
        ...(found.payeeHistory ? { payeeHistory: found.payeeHistory } : {}),
      };
      const refs = [...attach.map((a) => a.journalRef), ...create.map((c) => c.payout.journalRef!)];
      return [
        {
          owner,
          outgoing: refs.flatMap((ref) => (byRef.has(ref) ? [byRef.get(ref)!] : [])),
          createRefs: create.map((c) => c.payout.journalRef!),
        },
      ];
    }
  );
}

/**
 * Write one moon owner's planned share in a transaction that re-reads its payouts: an officer's
 * record that landed since the plan takes the journal entry instead of a second row, and an
 * entry another writer already used is skipped. Audited. Returns what it wrote.
 */
export async function applyFeederPayoutPlan(
  deps: BookDeps,
  collector: number,
  plan: OwnerPayoutPlan,
  actor: Actor
): Promise<{ attached: number; recorded: number }> {
  const corporationId = plan.owner.corporationId;
  const feeder = bookRef(deps.db, collector).collection(FEEDERS).doc(String(corporationId));
  const col = payoutsOf(deps, collector, corporationId);
  const createRefs = new Set(plan.createRefs);
  const written = await deps.db.runTransaction(async (tx) => {
    if (!(await tx.get(feeder)).exists) return { attached: 0, recorded: 0 };
    const stored = (await tx.get(col)).docs.map(storedPayout);
    const [fresh] = reconcileBookOutgoing({
      owners: [{ ...plan.owner, payouts: stored }],
      outgoing: plan.outgoing,
    });
    const attach = fresh?.attach ?? [];
    const create = (fresh?.create ?? []).filter((c) => createRefs.has(c.payout.journalRef!));
    if (attach.length + create.length === 0) return { attached: 0, recorded: 0 };
    for (const a of attach) {
      tx.update(col.doc(a.id), { status: 'matched', journalRef: a.journalRef });
    }
    for (const c of create) tx.create(col.doc(c.id), c.payout);
    tx.update(feeder, { [PAYOUTS_WRITTEN_AT]: deps.now() });
    appendAudit(tx, deps, collector, actor, 'feederPayoutsReconciled', {
      feederCorporationId: corporationId,
      attached: attach.map((a) => a.journalRef),
      recorded: create.map((c) => c.payout.journalRef!),
    });
    return { attached: attach.length, recorded: create.length };
  });
  if (written.attached + written.recorded > 0) {
    await tryRebuildFeederView(deps, collector, corporationId);
  }
  return written;
}

const SCHEDULED_ACTOR: Actor = { characterId: null, name: 'Scheduled sync', via: SCHEDULED_VIA };

/**
 * Attach the book's outgoing donations to its moon owners' payouts, and record the ones nobody
 * did. `outgoing` is always what the server itself read from the wallet journal: the scheduled
 * sync passes the journal it just read; the callable below reads it. Idempotent (a journal entry
 * counts once).
 */
export async function reconcileFeederPayouts(
  deps: BookDeps,
  collector: number,
  outgoing: readonly OutgoingDonation[],
  actor: Actor = SCHEDULED_ACTOR
): Promise<{ attached: number; recorded: number }> {
  let attached = 0;
  let recorded = 0;
  for (const plan of await planFeederPayouts(deps, collector, outgoing)) {
    const done = await applyFeederPayoutPlan(deps, collector, plan, actor);
    attached += done.attached;
    recorded += done.recorded;
  }
  return { attached, recorded };
}

/**
 * An officer's browser sync asks for a reconcile. The role is checked live and the server reads
 * the corporation's wallet journal with the officer's own token (each of the book's divisions),
 * so nothing a client says it sent is ever recorded as a journal payment.
 */
export async function reconcileFeederPayoutsCall(
  deps: BookDeps & { esi?: SyncEsi },
  caller: Caller,
  input: ReconcilePayoutsInput
): Promise<{ attached: number; recorded: number }> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  if (!deps.esi || input.accessToken === undefined) {
    fail('failed-precondition', 'The wallet journal cannot be read now', 'journal-unavailable');
  }
  const book = await bookRef(deps.db, input.corporationId).get();
  const raw: unknown = book.get('divisions');
  const divisions =
    Array.isArray(raw) && raw.length > 0
      ? raw.filter((d): d is number => typeof d === 'number')
      : [1];
  const outgoing: OutgoingDonation[] = [];
  for (const division of divisions) {
    const journal = await deps.esi.journal(input.corporationId, division, input.accessToken);
    if (journal.kind !== 'ok') continue;
    outgoing.push(...outgoingDonationsFromJournal(journal.data, division, input.corporationId));
  }
  return reconcileFeederPayouts(deps, input.corporationId, outgoing, {
    characterId: access.characterId,
    name: access.characterName,
  });
}
