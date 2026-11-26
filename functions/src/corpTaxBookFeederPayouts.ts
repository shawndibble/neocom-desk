import { utcDay } from './timeConstants.js';
import { FieldValue } from 'firebase-admin/firestore';
import { fail, type Caller } from './actorAuth.js';
import { HttpsError } from 'firebase-functions/v2/https';
import { boundedString, record } from './communities.js';
import {
  FEEDERS,
  parseBookCall,
  parseFeederTarget,
  type BookCall,
  type FeederTargetCall,
} from './corpTaxBook.js';
import {
  PAYOUT_LINK_WINDOW_DAYS,
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
  feederRef,
  type Actor,
  type BookDeps,
} from './corpTaxBookStore.js';
import type { SyncEsi } from './corpTaxBookSyncEsi.js';

export const PAYOUTS = 'payouts';

const PAYOUTS_WRITTEN_AT = 'payoutsWrittenAt';

const PAYOUT_TOTALS = 'payoutTotals';

export interface PayoutTotals {
  count: number;
  amount: number;
}

export const totalPayouts = (
  rows: readonly { amount: number; notAPayout?: boolean }[]
): PayoutTotals =>
  rows.reduce<PayoutTotals>(
    (t, p) => (p.notAPayout ? t : { count: t.count + 1, amount: t.amount + p.amount }),
    {
      count: 0,
      amount: 0,
    }
  );

function storedTotals(feeder: FirebaseFirestore.DocumentSnapshot): PayoutTotals | undefined {
  const t = feeder.get(PAYOUT_TOTALS) as Partial<PayoutTotals> | undefined;
  return typeof t?.count === 'number' && typeof t.amount === 'number'
    ? { count: t.count, amount: t.amount }
    : undefined;
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const payoutFloor = (days: readonly string[]): string =>
  days.length === 0 ? '' : shiftDate([...days].sort()[0]!, -PAYOUT_LINK_WINDOW_DAYS);

type Tx = FirebaseFirestore.Transaction;

async function readForWrite(
  tx: Tx,
  feeder: FirebaseFirestore.DocumentSnapshot,
  col: FirebaseFirestore.CollectionReference,
  floor: string
): Promise<{ stored: StoredPayout[]; totals: PayoutTotals; backfill: boolean }> {
  const totals = storedTotals(feeder);
  if (totals) {
    const slice = await tx.get(col.where('date', '>=', floor));
    return { stored: slice.docs.map(storedPayout), totals, backfill: false };
  }
  const stored = (await tx.get(col)).docs.map(storedPayout);
  return { stored, totals: totalPayouts(stored), backfill: true };
}

export interface RecordPayoutInput extends FeederTargetCall {
  amount: number;
  date: string;
  method: 'donation' | 'contract' | 'other';
}

export function parseRecordPayoutInput(data: unknown): RecordPayoutInput {
  const target = parseFeederTarget(data);
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
  const target = parseFeederTarget(data);
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

export type ReconcilePayoutsInput = BookCall;

export function parseReconcilePayoutsInput(data: unknown): ReconcilePayoutsInput {
  return parseBookCall(data);
}

const payoutsOf = (deps: BookDeps, collector: number, feeder: number) =>
  feederRef(deps.db, collector, feeder).collection(PAYOUTS);

type FeederWithPayees = FeederRecord & { payeeHistory?: PayeeChange[] };

type StoredPayout = FeederPayout & { id: string; confirmedAt?: number };

const storedPayout = (d: FirebaseFirestore.QueryDocumentSnapshot): StoredPayout => ({
  ...(d.data() as FeederPayout & { confirmedAt?: number }),
  notAPayout: d.get('notAPayout') === true,
  id: d.id,
});

export async function recordFeederPayout(
  deps: BookDeps,
  caller: Caller,
  input: RecordPayoutInput
): Promise<{ id: string }> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  const feeder = feederRef(deps.db, input.corporationId, input.feederCorporationId);
  const payout = buildRecordedPayout(input);
  const col = payoutsOf(deps, input.corporationId, input.feederCorporationId);
  const fresh = col.doc();
  const id = await deps.db.runTransaction(async (tx) => {
    const feederSnap = await tx.get(feeder);
    if (!feederSnap.exists) fail('not-found', 'No such moon owner', 'no-feeder');
    const { stored, totals } = await readForWrite(tx, feederSnap, col, payoutFloor([input.date]));
    const merge = payoutToMerge(stored, input);
    const waiting = merge !== undefined && stored.find((p) => p.id === merge)?.unconfirmed === true;
    if (merge)
      tx.update(col.doc(merge), {
        confirmedAt: deps.now(),
        ...(waiting ? { notAPayout: false, unconfirmed: FieldValue.delete() } : {}),
      });
    else tx.create(fresh, payout);
    tx.update(feeder, {
      [PAYOUTS_WRITTEN_AT]: deps.now(),
      [PAYOUT_TOTALS]:
        merge && !waiting
          ? totals
          : { count: totals.count + 1, amount: totals.amount + payout.amount },
    });
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

export async function markFeederPayout(
  deps: BookDeps,
  caller: Caller,
  input: MarkPayoutInput
): Promise<{ ok: true }> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  const feeder = feederRef(deps.db, input.corporationId, input.feederCorporationId);
  const col = payoutsOf(deps, input.corporationId, input.feederCorporationId);
  const ref = col.doc(input.payoutId);
  await deps.db.runTransaction(async (tx) => {
    const [row, feederSnap] = await Promise.all([tx.get(ref), tx.get(feeder)]);
    if (!row.exists) fail('not-found', 'No such payment', 'no-payout');
    const was = row.get('notAPayout') === true;
    const amount = Number(row.get('amount'));
    const known = storedTotals(feederSnap);
    const step = was === input.notAPayout ? 0 : input.notAPayout ? -1 : 1;
    const totals = known
      ? { count: known.count + step, amount: known.amount + step * amount }
      : totalPayouts(
          (await tx.get(col)).docs.map((d) => ({
            amount: Number(d.get('amount')),
            notAPayout: d.id === ref.id ? input.notAPayout : d.get('notAPayout') === true,
          }))
        );
    tx.update(ref, { notAPayout: input.notAPayout, unconfirmed: FieldValue.delete() });
    if (feederSnap.exists) tx.update(feeder, { [PAYOUT_TOTALS]: totals });
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

export interface OwnerPayoutPlan {
  owner: Omit<OwnerOutgoing, 'payouts'>;
  outgoing: OutgoingDonation[];
  createRefs: number[];
}

export async function planFeederPayouts(
  deps: BookDeps,
  collector: number,
  outgoing: readonly OutgoingDonation[]
): Promise<OwnerPayoutPlan[]> {
  if (outgoing.length === 0) return [];
  const feeders = await bookRef(deps.db, collector).collection(FEEDERS).get();
  const recipients = new Set(outgoing.map((d) => d.recipientId));
  const candidates = feeders.docs.flatMap((doc) => {
    const rec = doc.data() as FeederWithPayees;
    const corporationId = Number(doc.id);
    const ids = [corporationId, rec.payee?.id, ...(rec.payeeHistory ?? []).map((h) => h.payee.id)];
    return ids.some((id) => id !== undefined && recipients.has(id)) ? [{ rec, corporationId }] : [];
  });
  if (candidates.length === 0) return [];
  const floor = payoutFloor(outgoing.map((d) => d.at));
  const owners = await Promise.all(
    candidates.map(async ({ rec, corporationId }) => {
      const payouts = (
        await payoutsOf(deps, collector, corporationId).where('date', '>=', floor).get()
      ).docs.map(storedPayout);
      return {
        corporationId,
        ...(rec.payee ? { payee: rec.payee } : {}),
        ...(rec.payeeHistory ? { payeeHistory: rec.payeeHistory } : {}),
        payouts,
        since: rec.coveragePeriods.map((p) => p.from).sort()[0] ?? utcDay(rec.joinedAt),
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

export async function applyFeederPayoutPlan(
  deps: BookDeps,
  collector: number,
  plan: OwnerPayoutPlan,
  actor: Actor
): Promise<{ attached: number; recorded: number }> {
  const corporationId = plan.owner.corporationId;
  const feeder = feederRef(deps.db, collector, corporationId);
  const col = payoutsOf(deps, collector, corporationId);
  const createRefs = new Set(plan.createRefs);
  const written = await deps.db.runTransaction(async (tx) => {
    const feederSnap = await tx.get(feeder);
    if (!feederSnap.exists) return { attached: 0, recorded: 0 };
    const { stored, totals, backfill } = await readForWrite(
      tx,
      feederSnap,
      col,
      payoutFloor(plan.outgoing.map((d) => d.at))
    );
    const [fresh] = reconcileBookOutgoing({
      owners: [{ ...plan.owner, payouts: stored }],
      outgoing: plan.outgoing,
    });
    const attach = fresh?.attach ?? [];
    const create = (fresh?.create ?? []).filter((c) => createRefs.has(c.payout.journalRef!));
    if (attach.length + create.length === 0) {
      if (backfill) tx.update(feeder, { [PAYOUT_TOTALS]: totals });
      return { attached: 0, recorded: 0 };
    }
    for (const a of attach) {
      tx.update(col.doc(a.id), { status: 'matched', journalRef: a.journalRef });
    }
    for (const c of create) tx.create(col.doc(c.id), c.payout);
    const counted = create.filter((c) => !c.payout.notAPayout);
    tx.update(feeder, {
      [PAYOUTS_WRITTEN_AT]: deps.now(),
      [PAYOUT_TOTALS]: {
        count: totals.count + counted.length,
        amount: totals.amount + counted.reduce((sum, c) => sum + c.payout.amount, 0),
      },
    });
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
