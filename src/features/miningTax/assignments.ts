/**
 * Assignment CRUD for the Moon Mining Tax ledger (issue #523): links a Mining
 * Ledger Entry (or a split slice of its ore lines) to a Payee, snapshotting
 * tax % and Jita-priced ISK value **at assignment time** (invoice semantics —
 * see `engine/miningTax/valuation.ts`).
 */
import {
  db,
  type MiningTaxAssignmentRecord,
  type MiningTaxOreLine,
  type MiningTaxPaymentInfo,
} from '@/db';
import { markMiningTaxAssignmentDeleted, scheduleSync } from '@/sync';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { linesOwnedBy } from '@/engine/miningTax/ownership';
import { planSplit } from '@/engine/miningTax/split';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';
import { loadJitaUnitPrices } from './pricing';

export function loadAssignments(characterId: number): Promise<MiningTaxAssignmentRecord[]> {
  return db.miningTaxAssignments.where('characterId').equals(characterId).toArray();
}

export interface AssignInput {
  characterId: number;
  date: string;
  solarSystemId: number;
  payeeId: string;
  oreLines: MiningTaxOreLine[];
  /** The Payee's default, or the user's override in the Assign dialog. */
  taxPct: number;
  /**
   * The Jita-priced default, or the pilot's own correction — the Assign
   * dialog prefills both from `computeAssignmentValue` but leaves them
   * editable, since a Jita price or a Payee's default rate can be wrong for
   * a specific haul. Taken as given here rather than recomputed, so a
   * pilot's edit is what actually gets persisted.
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
  await db.miningTaxAssignments.put(record);
  scheduleSync(input.characterId);
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
 * Dismisses an entry ("I don't pay tax on this") — no Payee, no tax owed.
 * Still snapshots `oreLines` and still participates in `reconcileAssignments`
 * the same way a real Assignment does: growth on a dismissed entry surfaces
 * for reconsideration (`needs-review`) rather than being silently absorbed
 * into a standing "never taxed" verdict.
 */
export async function dismissEntry(input: DismissInput): Promise<MiningTaxAssignmentRecord> {
  const [record] = await dismissEntries([input]);
  return record;
}

/**
 * Dismisses several entries in one write — the ledger's bulk Dismiss (issue
 * #539). Deliberately one `bulkPut` and one `scheduleSync` *per character*
 * rather than a loop over `dismissEntry`: dismissing a week of entries would
 * otherwise fire a week's worth of syncs for what is a single user action.
 * Same shape as `markAssignmentsPaid`.
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
  for (const characterId of new Set(inputs.map((i) => i.characterId))) scheduleSync(characterId);
  return records;
}

export interface UpdateAssignmentInput {
  payeeId: string;
  taxPct: number;
  estimatedValue: number;
  taxOwed: number;
}

/**
 * Edits an existing Assignment's Payee/tax %/value/tax owed from the row
 * detail view — the same four fields the Assign form itself collects, now
 * correctable after the fact (a Jita price or a Payee's rate can turn out
 * wrong after the invoice moment `createAssignment` snapshotted).
 *
 * Deliberately leaves two things alone: `oreLines`, since line membership is
 * what the sole-vs-split ownership rule (`rowStatus.ts`) keys off — resplitting
 * a record happens through Undo + a fresh Assign, not this edit — and
 * `status`/`paidAt`, so correcting a Paid record's ISK doesn't silently
 * un-pay it.
 */
export async function updateAssignment(
  assignment: MiningTaxAssignmentRecord,
  input: UpdateAssignmentInput
): Promise<MiningTaxAssignmentRecord> {
  const updated: MiningTaxAssignmentRecord = {
    ...assignment,
    payeeId: input.payeeId,
    taxPct: input.taxPct,
    estimatedValue: input.estimatedValue,
    taxOwed: input.taxOwed,
    updatedAt: Date.now(),
  };
  await db.miningTaxAssignments.put(updated);
  scheduleSync(assignment.characterId);
  return updated;
}

export interface JoinMemberInput {
  characterId: number;
  date: string;
  solarSystemId: number;
  /** The member's existing Assignment, or `null` when this date was still unassigned and `joinAssignments` should create one. */
  assignment: MiningTaxAssignmentRecord | null;
  /** Required (and only meaningful) when `assignment` is `null`. */
  oreLines?: MiningTaxOreLine[];
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
 * `payeeId`/`taxPct`, valued from its own `oreLines` at `unitPrices` — never
 * a blended or split value across members.
 */
export async function joinAssignments(
  members: readonly JoinMemberInput[],
  payeeId: string,
  taxPct: number,
  unitPrices: ReadonlyMap<number, number>
): Promise<MiningTaxAssignmentRecord[]> {
  const groupId =
    members.map((m) => m.assignment?.groupId).find((id) => id !== undefined) ?? crypto.randomUUID();
  const now = Date.now();
  const records: MiningTaxAssignmentRecord[] = members.map((m) => {
    if (m.assignment) return { ...m.assignment, groupId, updatedAt: now };
    const oreLines = m.oreLines ?? [];
    const { estimatedValue, taxOwed } = computeAssignmentValue(oreLines, unitPrices, taxPct);
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
  await db.miningTaxAssignments.bulkPut(records);
  for (const characterId of new Set(members.map((m) => m.characterId))) scheduleSync(characterId);
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
  for (const characterId of new Set(assignments.map((a) => a.characterId)))
    scheduleSync(characterId);
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
 * Splits one assigned day by quantity between its Payee and a second one
 * (issue #523: two local-time sessions at two corps' moons land in one
 * EVE/UTC ledger entry). The moved units become a fresh Outstanding
 * Assignment; the original keeps its status — a Paid day can be split after
 * the fact, and the paid figure stays with the kept side — and its remaining
 * units.
 *
 * Both sides are re-priced at `unitPrices` (the current Jita buy) rather
 * than apportioning the original's possibly hand-edited value: two
 * independently priced obligations is the same rule "join entries" chose.
 */
export async function splitAssignment(
  original: MiningTaxAssignmentRecord,
  input: SplitInput,
  unitPrices: ReadonlyMap<number, number>
): Promise<{ kept: MiningTaxAssignmentRecord; created: MiningTaxAssignmentRecord }> {
  const { kept: keptLines, moved: movedLines } = planSplit(original.oreLines, input.moves);
  if (movedLines.length === 0) throw new Error('Nothing to move');
  if (keptLines.length === 0) throw new Error('Cannot move every unit — unassign instead');

  const now = Date.now();
  const keptValue = computeAssignmentValue(keptLines, unitPrices, original.taxPct);
  const kept: MiningTaxAssignmentRecord = {
    ...original,
    oreLines: keptLines,
    estimatedValue: keptValue.estimatedValue,
    taxOwed: keptValue.taxOwed,
    updatedAt: now,
  };
  delete kept.collectsGrowth;
  if (input.collector === 'original') kept.collectsGrowth = true;

  const createdValue = computeAssignmentValue(movedLines, unitPrices, input.taxPct);
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
  scheduleSync(original.characterId);
  return { kept, created };
}

export async function deleteAssignment(assignment: MiningTaxAssignmentRecord): Promise<void> {
  await markMiningTaxAssignmentDeleted(assignment.characterId, assignment.id);
}

/**
 * Accepts a `needs-review` Assignment's growth: re-prices and re-snapshots
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
 */
export async function resolveNeedsReview(
  assignment: MiningTaxAssignmentRecord,
  freshEntry: MiningLedgerEntry,
  siblings: readonly MiningTaxAssignmentRecord[]
): Promise<void> {
  const relevantFresh = linesOwnedBy(freshEntry.oreLines, siblings, assignment.id);
  const prices = await loadJitaUnitPrices(relevantFresh.map((line) => line.typeId));
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
  await db.miningTaxAssignments.put(updated);
  scheduleSync(assignment.characterId);
}
