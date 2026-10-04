/**
 * Assignment record writes for the Moon Mining Tax ledger (issue #523): links
 * a Mining Ledger Entry (or a split slice of its ore lines) to a Payee,
 * snapshotting tax % and the hub-priced ISK value **at assignment time**
 * (invoice semantics — see `engine/miningTax/valuation.ts`). The hub is the
 * Payee's own (`PayeeRecord.hubId`, Jita when it names none), since the figure
 * is a bill one player sends another.
 *
 * These are primitives, not actions: none of them schedules a sync, and a
 * multi-step change is only safe when its steps share one transaction. The UI
 * reaches them through `ledgerActions.ts`, which wraps each action in one
 * Dexie transaction (covering `db.settings` too, for delete tombstones) and
 * schedules the sync after it commits. Every write here is Dexie-only, so it
 * can run inside that transaction.
 */
import {
  db,
  type MiningTaxAssignmentRecord,
  type MiningTaxOreLine,
  type MiningTaxPaymentInfo,
  type MiningTaxPaymentLink,
  type MiningTaxPaymentLinkSource,
  type MiningTaxPaymentMethod,
} from '@/db';
import { appendTombstones, tombstoneKey } from '@/sync/localBookkeeping';
import { MINING_TAX_ASSIGNMENTS } from '@/sync/syncedCollections';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { linesOwnedBy } from '@/engine/miningTax/ownership';
import { planSplit } from '@/engine/miningTax/split';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';
import { normalizePaymentInfo } from './paymentLinks';
import { loadPayees } from './payees';
import { hubForPayee, loadUnitPricesOnDate } from './pricing';

/**
 * Thrown when a new Assignment would claim ore an existing one already does
 * for the same Mining Ledger Entry — the pilot's view was stale (another tab
 * or device assigned it first), and saving would bill the same ore twice.
 */
export class AlreadyAssignedError extends Error {
  constructor() {
    super('This ore is already assigned');
    this.name = 'AlreadyAssignedError';
  }
}

/**
 * Re-reads the database, not the caller's snapshot, and refuses when what
 * `oreLines` asks for, added to what stored Assignments (a dismissal included)
 * on this entry already claim, exceeds what the entry holds — the twin case,
 * two records each claiming all of it. `entryOreLines` is the ledger's ore for
 * the entry; comparing quantities rather than ore types keeps a legitimate
 * claim on growth ESI reported for a type another Assignment already holds
 * (`computeOwnership`'s unassigned residual) from being refused. Without it
 * there is nothing to measure against, so any second claim on a type refuses.
 * Meant to run inside the same transaction as the write it guards.
 */
async function assertUnclaimed(
  characterId: number,
  date: string,
  solarSystemId: number,
  oreLines: readonly MiningTaxOreLine[],
  entryOreLines?: readonly MiningTaxOreLine[]
): Promise<void> {
  const existing = await db.miningTaxAssignments.where('characterId').equals(characterId).toArray();
  const claimed = new Map<number, number>();
  for (const a of existing) {
    if (a.date !== date || a.solarSystemId !== solarSystemId) continue;
    for (const line of a.oreLines) {
      claimed.set(line.typeId, (claimed.get(line.typeId) ?? 0) + line.quantity);
    }
  }
  const entryByType = entryOreLines && new Map(entryOreLines.map((l) => [l.typeId, l.quantity]));
  const clash = oreLines.some((line) => {
    const already = claimed.get(line.typeId) ?? 0;
    if (already === 0) return false;
    const held = entryByType?.get(line.typeId);
    return held === undefined ? true : already + line.quantity > held;
  });
  if (clash) throw new AlreadyAssignedError();
}

/** Normalizes each record's `payment` on the way out — see `normalizePaymentInfo`. */
export async function loadAssignments(characterId: number): Promise<MiningTaxAssignmentRecord[]> {
  const records = await db.miningTaxAssignments.where('characterId').equals(characterId).toArray();
  return records.map((r) => (r.payment ? { ...r, payment: normalizePaymentInfo(r.payment) } : r));
}

export interface AssignInput {
  characterId: number;
  date: string;
  solarSystemId: number;
  payeeId: string;
  oreLines: MiningTaxOreLine[];
  /** The entry's full ore from the ledger the pilot is looking at — what the double-assignment guard measures claims against. */
  entryOreLines?: readonly MiningTaxOreLine[];
  /** The Payee's default, or the user's override in the Assign dialog. */
  taxPct: number;
  /**
   * The hub-priced default, or the pilot's own correction — the Assign
   * dialog prefills both from `computeAssignmentValue` (at the chosen Payee's
   * hub) but leaves them editable, since a hub price or a Payee's default rate
   * can be wrong for a specific haul. Taken as given here rather than
   * recomputed, so a pilot's edit is what actually gets persisted.
   */
  estimatedValue: number;
  taxOwed: number;
  /** "I already paid this" — the Assign dialog's checkbox, unchecked by default. */
  markPaid: boolean;
}

/** Creates one Assignment, snapshotting the (possibly pilot-corrected) value and tax right now. */
export async function createAssignment(input: AssignInput): Promise<MiningTaxAssignmentRecord> {
  const now = Date.now();
  const record: MiningTaxAssignmentRecord = {
    id: crypto.randomUUID(),
    characterId: input.characterId,
    date: input.date,
    solarSystemId: input.solarSystemId,
    payeeId: input.payeeId,
    oreLines: input.oreLines,
    taxPct: input.taxPct,
    estimatedValue: input.estimatedValue,
    taxOwed: input.taxOwed,
    status: input.markPaid ? 'paid' : 'outstanding',
    ...(input.markPaid ? { paidAt: now } : {}),
    updatedAt: now,
  };
  // Check and write in one transaction so two tabs cannot both pass the check
  // (under a ledger action this joins the action's own transaction).
  await db.transaction('rw', db.miningTaxAssignments, async () => {
    await assertUnclaimed(
      input.characterId,
      input.date,
      input.solarSystemId,
      input.oreLines,
      input.entryOreLines
    );
    await db.miningTaxAssignments.put(record);
  });
  return record;
}

export interface DismissInput {
  characterId: number;
  date: string;
  solarSystemId: number;
  oreLines: MiningTaxOreLine[];
  /** Informational only — a dismissed entry owes no tax regardless. */
  estimatedValue: number;
}

/**
 * Dismisses entries ("I don't pay tax on this") — no Payee, no tax owed — in
 * one write, whether one row's or the ledger's bulk Dismiss (issue #539).
 * Still snapshots `oreLines` and still participates in `reconcileAssignments`
 * the same way a real Assignment does: growth on a dismissed entry surfaces
 * for reconsideration (`needs-review`) rather than being silently absorbed
 * into a standing "never taxed" verdict.
 */
export async function dismissEntries(
  inputs: readonly DismissInput[]
): Promise<MiningTaxAssignmentRecord[]> {
  if (inputs.length === 0) return [];
  const now = Date.now();
  const records = inputs.map((input): MiningTaxAssignmentRecord => ({
    id: crypto.randomUUID(),
    characterId: input.characterId,
    date: input.date,
    solarSystemId: input.solarSystemId,
    oreLines: input.oreLines,
    taxPct: 0,
    estimatedValue: input.estimatedValue,
    taxOwed: 0,
    status: 'dismissed',
    updatedAt: now,
  }));
  await db.miningTaxAssignments.bulkPut(records);
  return records;
}

export interface CombinedMemberValues {
  estimatedValue: number;
  taxOwed: number;
  /**
   * The pilot's per-ore corrections for this day. Replaces whatever was
   * stored outright, and omitting it removes them, rather than merging: the
   * edit form always sends the whole map, so a merge would resurrect a
   * correction the pilot just cleared.
   */
  oreLineValues?: Record<number, number>;
}

export interface UpdateCombinedInput {
  payeeId: string;
  taxPct: number;
  /** Each member's own figures, keyed by Assignment id. A member missing here keeps its stored ones. */
  members: Readonly<Record<string, CombinedMemberValues>>;
}

/**
 * Saves an entry's edit form (`EntryEditDialog`) in one write: one Payee and
 * one tax % for every day of it, plus each day's own value and tax owed. A
 * Payee or rate change keeps the `groupId` — a combined entry moves
 * together, which is exactly what keeps the "one obligation, one Payee, one
 * rate" rule true. `oreLines` stay as they are (line membership is what the
 * sole-vs-split ownership rule in `rowStatus.ts` keys off), and so do status
 * and payment: correcting a Paid entry's figures doesn't un-pay it.
 */
export async function updateCombinedAssignments(
  assignments: readonly MiningTaxAssignmentRecord[],
  input: UpdateCombinedInput
): Promise<MiningTaxAssignmentRecord[]> {
  if (assignments.length === 0) return [];
  const now = Date.now();
  const updated = assignments.map((a): MiningTaxAssignmentRecord => {
    const values = input.members[a.id];
    const next: MiningTaxAssignmentRecord = {
      ...a,
      payeeId: input.payeeId,
      taxPct: input.taxPct,
      ...(values ? { estimatedValue: values.estimatedValue, taxOwed: values.taxOwed } : {}),
      updatedAt: now,
    };
    if (values) {
      if (values.oreLineValues !== undefined) next.oreLineValues = values.oreLineValues;
      else delete next.oreLineValues;
    }
    return next;
  });
  await db.miningTaxAssignments.bulkPut(updated);
  return updated;
}

/**
 * "Take out of combined" / "Uncombine all": clears `groupId` and nothing
 * else, so each day goes back to being its own row with its Payee, figures,
 * status and payment intact. Taking one day out of a two-day entry leaves a
 * lone `groupId`, which already renders as an ordinary row (`flatten`).
 */
export async function uncombineAssignments(
  assignments: readonly MiningTaxAssignmentRecord[]
): Promise<void> {
  const now = Date.now();
  const updated = assignments
    .filter((a) => a.groupId !== undefined)
    .map((a): MiningTaxAssignmentRecord => {
      const next: MiningTaxAssignmentRecord = { ...a, updatedAt: now };
      delete next.groupId;
      return next;
    });
  if (updated.length === 0) return;
  await db.miningTaxAssignments.bulkPut(updated);
}

/**
 * Deleting a Payee that is still owed (scope decision 20261004): its
 * Assignments move to another Payee rather than turning into "Unknown
 * Payee". Only the Payee changes — the figures were the bill as it stood,
 * and a combined entry moves whole, so its `groupId` stays.
 */
export async function moveAssignmentsToPayee(
  assignments: readonly MiningTaxAssignmentRecord[],
  payeeId: string
): Promise<void> {
  if (assignments.length === 0) return;
  const now = Date.now();
  const updated = assignments.map((a) => ({ ...a, payeeId, updatedAt: now }));
  await db.miningTaxAssignments.bulkPut(updated);
}

export interface JoinMemberInput {
  characterId: number;
  date: string;
  solarSystemId: number;
  /** The member's existing Assignment, or `null` when this date was still unassigned and `joinAssignments` should create one. */
  assignment: MiningTaxAssignmentRecord | null;
  /** Required (and only meaningful) when `assignment` is `null`. */
  oreLines?: MiningTaxOreLine[];
  /** The member entry's full ledger ore, for the double-assignment guard — see `AssignInput.entryOreLines`. */
  entryOreLines?: readonly MiningTaxOreLine[];
}

/**
 * Joins 2+ Mining Ledger Entries into one combined obligation ("join
 * entries", issue #523) — a moon-mining session spanning midnight UTC shows
 * up as separate per-day entries in ESI's ledger even though a corp's own
 * billing treats it as one. Every member ends up sharing one `groupId`, so
 * `flatten()` (MoonMiningTax.tsx) renders them as a single row.
 *
 * An already-assigned member is only ever re-tagged with the shared
 * `groupId` — its Payee, tax %, value, and status are left exactly as they
 * are. The caller is responsible for having verified, before calling this,
 * that every already-assigned member shares one Payee and tax % (the
 * decision doc's merge rule) — this function does not re-check it. A
 * still-unassigned member gets a brand new Assignment created against
 * `payeeId`/`taxPct`, valued from its own `oreLines` at `pricesOn(m.date)` —
 * never a blended or split value across members. `pricesOn` rather than one
 * flat map: a join can combine members with *different* mined dates (that is
 * its whole purpose — one moon-mining session spanning midnight UTC), so one
 * shared map would misprice whichever member's date it wasn't fetched for.
 */
export async function joinAssignments(
  members: readonly JoinMemberInput[],
  payeeId: string,
  taxPct: number,
  pricesOn: (date: string) => ReadonlyMap<number, number>
): Promise<MiningTaxAssignmentRecord[]> {
  const groupId =
    members.map((m) => m.assignment?.groupId).find((id) => id !== undefined) ?? crypto.randomUUID();
  const now = Date.now();
  const records: MiningTaxAssignmentRecord[] = members.map((m) => {
    if (m.assignment) return { ...m.assignment, groupId, updatedAt: now };
    const oreLines = m.oreLines ?? [];
    const { estimatedValue, taxOwed } = computeAssignmentValue(oreLines, pricesOn(m.date), taxPct);
    return {
      id: crypto.randomUUID(),
      characterId: m.characterId,
      date: m.date,
      solarSystemId: m.solarSystemId,
      payeeId,
      oreLines,
      taxPct,
      estimatedValue,
      taxOwed,
      status: 'outstanding',
      groupId,
      updatedAt: now,
    };
  });
  // Only the members this call would *create* are checked — an already-assigned
  // member is just re-tagged, and adds no claim. Same transaction as the write.
  await db.transaction('rw', db.miningTaxAssignments, async () => {
    for (const m of members) {
      if (m.assignment) continue;
      await assertUnclaimed(
        m.characterId,
        m.date,
        m.solarSystemId,
        m.oreLines ?? [],
        m.entryOreLines
      );
    }
    await db.miningTaxAssignments.bulkPut(records);
  });
  return records;
}

/** Everything about a settle-up but the shared id, which `markAssignmentsPaid` mints. `amount` is the whole-ISK figure actually sent in game, so it matches the journal entry it may be linked to. */
export type PaymentInput = Omit<MiningTaxPaymentInfo, 'paymentId'>;

/**
 * Marks several Assignments paid at once — the itemized Settle-up dialog
 * commits through this. Never a single blind "mark all paid": the caller is
 * responsible for having shown the itemized list (payee/character/date
 * range/total) before calling this.
 *
 * With `payment`, every Assignment additionally records how it was settled
 * under one shared `paymentId` and the lump-sum `amount` actually sent — the
 * Settle-up flow's "record it" step. Without it, only `status`/`paidAt`
 * move, as before.
 */
export async function markAssignmentsPaid(
  assignments: readonly MiningTaxAssignmentRecord[],
  payment?: PaymentInput
): Promise<void> {
  if (assignments.length === 0) return;
  const now = Date.now();
  const paymentInfo: MiningTaxPaymentInfo | undefined = payment && {
    paymentId: crypto.randomUUID(),
    ...payment,
  };
  const updated = assignments.map((a): MiningTaxAssignmentRecord => ({
    ...a,
    status: 'paid',
    paidAt: now,
    ...(paymentInfo ? { payment: paymentInfo } : {}),
    updatedAt: now,
  }));
  await db.miningTaxAssignments.bulkPut(updated);
}

/** Which linked-transaction array a call targets — a wallet-journal entry id or a contract id, never both. */
export type PaymentTransactionRef = { journalRefId: number } | { contractId: number };

/** Every Assignment settled by the same lump sum as `assignment` — linking or unlinking a transaction applies to the whole group, not just one row. Falls back to the row alone when there is no `payment` yet. */
export function assignmentsSharingPayment(
  assignment: MiningTaxAssignmentRecord,
  all: readonly MiningTaxAssignmentRecord[]
): MiningTaxAssignmentRecord[] {
  const paymentId = assignment.payment?.paymentId;
  if (paymentId === undefined) return [assignment];
  return all.filter((a) => a.payment?.paymentId === paymentId);
}

/** Appends one link onto whichever array `ref` names, normalizing the payment's legacy shape first. */
function withLink(
  payment: MiningTaxPaymentInfo,
  ref: PaymentTransactionRef,
  source: MiningTaxPaymentLinkSource
): MiningTaxPaymentInfo {
  const normalized = normalizePaymentInfo(payment);
  const link: MiningTaxPaymentLink = {
    refId: 'journalRefId' in ref ? ref.journalRefId : ref.contractId,
    source,
  };
  return 'journalRefId' in ref
    ? { ...normalized, journalLinks: [...(normalized.journalLinks ?? []), link] }
    : { ...normalized, contractLinks: [...(normalized.contractLinks ?? []), link] };
}

/**
 * Attaches a real wallet-journal or contract id to an already-recorded
 * Settle-up payment (`paymentLinks.ts`'s `autoMatchRecordedPayments`) — every
 * other field of `payment` is left exactly as the pilot recorded it, and this
 * always *adds* a link rather than replacing one, since a lump sum can be
 * paid in installments. Never called for the itemized settle-up link; that
 * path goes through `markAssignmentsPaid` instead, since it may also change
 * which Assignments a payment covers.
 */
export async function linkRecordedPayment(
  assignments: readonly MiningTaxAssignmentRecord[],
  ref: PaymentTransactionRef
): Promise<void> {
  if (assignments.length === 0) return;
  const now = Date.now();
  const updated = assignments.map((a): MiningTaxAssignmentRecord => {
    if (!a.payment) return a;
    return { ...a, payment: withLink(a.payment, ref, 'auto'), updatedAt: now };
  });
  await db.miningTaxAssignments.bulkPut(updated);
}

/** A minimal payment to create from the transaction's own data, when the target Assignment(s) have no `payment` yet — see `linkPaymentTransaction`. */
export interface FallbackPaymentInput {
  paidOn: string;
  amount: number;
  method: MiningTaxPaymentMethod;
}

/**
 * The manual "Link transaction" action (issue #540 follow-up): attaches a
 * wallet-journal or contract id to every Assignment in `assignments` — every
 * member of one payment's `paymentId` group, so linking from one row settles
 * the whole lump sum it belongs to. Purely informational: it never touches
 * `status`, `taxOwed`, or any other field, and — unlike `linkRecordedPayment`
 * — it is reachable from an already-Paid row that was settled before ESI had
 * posted the transaction, which is the gap this fills.
 *
 * When an Assignment has no `payment` at all yet (a bare "mark paid" with no
 * Settle-up record), `fallbackPayment` seeds a minimal one from the
 * transaction's own date/amount/method, rather than forcing a separate
 * "record payment" step first — the transaction already carries what a
 * payment record needs.
 */
export async function linkPaymentTransaction(
  assignments: readonly MiningTaxAssignmentRecord[],
  ref: PaymentTransactionRef,
  source: MiningTaxPaymentLinkSource,
  fallbackPayment: FallbackPaymentInput
): Promise<void> {
  if (assignments.length === 0) return;
  const now = Date.now();
  // Minted once, not per assignment: several bare-paid Assignments (a joined
  // group's "mark all paid", which records no payment at all) must land on
  // one shared payment, the same as if they'd gone through Settle-up
  // together — never one independent payment per member. An Assignment that
  // already has its own `payment` keeps its own paymentId regardless.
  const sharedPaymentId = crypto.randomUUID();
  const updated = assignments.map((a): MiningTaxAssignmentRecord => {
    const base: MiningTaxPaymentInfo = a.payment ?? {
      paymentId: sharedPaymentId,
      ...fallbackPayment,
    };
    return { ...a, payment: withLink(base, ref, source), updatedAt: now };
  });
  await db.miningTaxAssignments.bulkPut(updated);
}

/** Removes one linked transaction from every Assignment in `assignments` (a mistaken pick) — the mirror of `linkPaymentTransaction`. A no-op for an Assignment with no `payment` or without that link. */
export async function unlinkPaymentTransaction(
  assignments: readonly MiningTaxAssignmentRecord[],
  ref: PaymentTransactionRef
): Promise<void> {
  if (assignments.length === 0) return;
  const now = Date.now();
  const updated = assignments
    .filter((a): a is MiningTaxAssignmentRecord & { payment: MiningTaxPaymentInfo } => !!a.payment)
    .map((a): MiningTaxAssignmentRecord => {
      const normalized = normalizePaymentInfo(a.payment);
      const payment =
        'journalRefId' in ref
          ? {
              ...normalized,
              journalLinks: (normalized.journalLinks ?? []).filter(
                (l) => l.refId !== ref.journalRefId
              ),
            }
          : {
              ...normalized,
              contractLinks: (normalized.contractLinks ?? []).filter(
                (l) => l.refId !== ref.contractId
              ),
            };
      return { ...a, payment, updatedAt: now };
    });
  if (updated.length === 0) return;
  await db.miningTaxAssignments.bulkPut(updated);
}

export interface SplitInput {
  /** Units to move out of `original`, per ore type — each at most what `original` holds of that type; zero-quantity lines are ignored. */
  moves: readonly MiningTaxOreLine[];
  /** The second Payee, and the rate the moved ore is taxed at. */
  payeeId: string;
  taxPct: number;
  /**
   * Which side collects any further ore ESI reports for this day
   * (`engine/miningTax/ownership.ts`). Omit to leave both unflagged — e.g.
   * when a third Assignment on the same entry already collects.
   */
  collector?: 'original' | 'new';
}

/**
 * Per-unit prices for each side of a split. Two maps, not one: a split hands
 * ore to a *different* Payee by construction, and two Payees can bill at two
 * different trade hubs — pricing both sides from one book would misstate
 * whichever bill it did not come from. They are the same map whenever the two
 * Payees share a hub, which is the ordinary case. Both are resolved at the
 * *original* Assignment's mined date (`splitAssignment`'s own doc comment) —
 * a split only changes who is billed, never when the ore was mined.
 */
export interface SplitPrices {
  /** The original Payee's hub — what the units staying put are worth. */
  kept: ReadonlyMap<number, number>;
  /** The second Payee's hub — what the moved units are worth. */
  moved: ReadonlyMap<number, number>;
}

/**
 * Splits one assigned day by quantity between its Payee and a second one
 * (issue #523: two local-time sessions at two corps' moons land in one
 * EVE/UTC ledger entry). The moved units become a fresh Outstanding
 * Assignment; the original keeps its status — a Paid day can be split after
 * the fact, and the paid figure stays with the kept side — and its remaining
 * units.
 *
 * Both sides are re-priced at their own Payee's hub, at the original entry's
 * mined date (`SplitPrices`'s own doc comment), rather than apportioning the
 * original's possibly hand-edited value: two independently priced obligations
 * is the same rule "join entries" chose.
 */
export async function splitAssignment(
  original: MiningTaxAssignmentRecord,
  input: SplitInput,
  prices: SplitPrices
): Promise<{ kept: MiningTaxAssignmentRecord; created: MiningTaxAssignmentRecord }> {
  const { kept: keptLines, moved: movedLines } = planSplit(original.oreLines, input.moves);
  if (movedLines.length === 0) throw new Error('Nothing to move');
  if (keptLines.length === 0) throw new Error('Cannot move every unit — unassign instead');

  const now = Date.now();
  const keptValue = computeAssignmentValue(keptLines, prices.kept, original.taxPct);
  const kept: MiningTaxAssignmentRecord = {
    ...original,
    oreLines: keptLines,
    estimatedValue: keptValue.estimatedValue,
    taxOwed: keptValue.taxOwed,
    updatedAt: now,
  };
  // A per-ore-type override (`oreLineValues`) names typeIds against the
  // *original*'s line set — splitting changes which lines this record
  // covers, so a carried-over override would either dangle (a moved type no
  // longer here) or silently misprice a kept line the pilot never corrected
  // for this half of the split. Both sides re-price independently
  // (`SplitPrices`'s own doc comment); a hand-edited correction does not
  // survive that same way.
  delete kept.oreLineValues;
  delete kept.collectsGrowth;
  if (input.collector === 'original') kept.collectsGrowth = true;
  if (original.status === 'needs-review') {
    // Splitting is how the growth gets settled, so the kept side re-opens
    // exactly as `planNeedsReviewResolution` would leave it.
    kept.status = 'outstanding';
    delete kept.reviewDiff;
    delete kept.paidAt;
  }

  const createdValue = computeAssignmentValue(movedLines, prices.moved, input.taxPct);
  const created: MiningTaxAssignmentRecord = {
    id: crypto.randomUUID(),
    characterId: original.characterId,
    date: original.date,
    solarSystemId: original.solarSystemId,
    payeeId: input.payeeId,
    oreLines: movedLines,
    taxPct: input.taxPct,
    estimatedValue: createdValue.estimatedValue,
    taxOwed: createdValue.taxOwed,
    status: 'outstanding',
    ...(input.collector === 'new' ? { collectsGrowth: true } : {}),
    updatedAt: now,
  };

  await db.miningTaxAssignments.bulkPut([kept, created]);
  return { kept, created };
}

/**
 * Deletes Assignments and tombstones each one under its character, so the
 * deletion syncs instead of the next pull resurrecting it. Run inside a
 * transaction covering `db.settings` as well, or a failure between the two
 * writes leaves a row deleted here that comes back from the remote copy.
 */
export async function deleteAssignments(
  assignments: readonly Pick<MiningTaxAssignmentRecord, 'id' | 'characterId'>[]
): Promise<void> {
  if (assignments.length === 0) return;
  await db.miningTaxAssignments.bulkDelete(assignments.map((a) => a.id));
  const idsByCharacter = new Map<number, string[]>();
  for (const a of assignments) {
    const ids = idsByCharacter.get(a.characterId);
    if (ids) ids.push(a.id);
    else idsByCharacter.set(a.characterId, [a.id]);
  }
  for (const [characterId, ids] of idsByCharacter) {
    await appendTombstones(tombstoneKey(MINING_TAX_ASSIGNMENTS, characterId), ids);
  }
}

/**
 * Plans accepting a `needs-review` Assignment's growth (the write is the
 * caller's): re-prices and re-snapshots
 * its own ore lines to the entry's current fresh totals — a new valuation
 * moment, exactly like a fresh assignment — and clears `reviewDiff`.
 *
 * Deliberately reverts to `outstanding` even when the Assignment had been
 * `paid`: a full re-review is a simpler, and never *under*-stating, choice
 * than trying to carve the delta into a second record while leaving stale
 * paid/unpaid history behind (the risk the decision doc's "never silently
 * absorbed" rule exists to avoid is under-counting, not over-asking). A
 * Payee who genuinely already covered part of the new total is a one-click
 * "mark paid" away from being square again.
 *
 * `siblings` (every Assignment covering this entry — this one included, or
 * it re-snapshots to nothing) decides how much of the fresh entry it re-snapshots to: a sole Assignment
 * claims the whole entry, including any brand-new ore type; on a split entry
 * only the growth collector grows (`engine/miningTax/ownership.ts`).
 *
 * The re-price happens at this Assignment's *Payee's* hub, looked up here
 * rather than passed in: every caller reaches this from a row action that has
 * only the record, and a fresh invoice moment billed at some other hub's book
 * would restate a bill the landlord never quoted. A dismissal (no Payee) and
 * an Assignment whose Payee has since been deleted both fall back to Jita.
 *
 * Priced at `assignment.date` — the entry's mined date, not "now" (issue #523
 * follow-up decision doc): a re-review is re-snapshotting the *same* mined
 * ore's value, and the day it was mined didn't change just because the pilot
 * came back to reconcile it later.
 */
export async function planNeedsReviewResolution(
  assignment: MiningTaxAssignmentRecord,
  freshEntry: MiningLedgerEntry,
  siblings: readonly MiningTaxAssignmentRecord[]
): Promise<MiningTaxAssignmentRecord> {
  const relevantFresh = linesOwnedBy(freshEntry.oreLines, siblings, assignment.id);
  const payee =
    assignment.payeeId === undefined
      ? undefined
      : (await loadPayees(assignment.characterId)).find((p) => p.id === assignment.payeeId);
  const { prices } = await loadUnitPricesOnDate(
    assignment.characterId,
    relevantFresh.map((line) => line.typeId),
    hubForPayee(payee?.hubId),
    assignment.date
  );
  const { estimatedValue, taxOwed } = computeAssignmentValue(
    relevantFresh,
    prices,
    assignment.taxPct
  );
  const updated: MiningTaxAssignmentRecord = {
    ...assignment,
    oreLines: relevantFresh,
    estimatedValue,
    taxOwed,
    status: 'outstanding',
    updatedAt: Date.now(),
  };
  delete updated.reviewDiff;
  delete updated.paidAt;
  // Same reason `splitAssignment` drops it: `oreLineValues` names typeIds
  // against the pre-review line set, and growth can add or resize lines —
  // a carried-over override would misprice this fresh re-snapshot.
  delete updated.oreLineValues;
  return updated;
}
