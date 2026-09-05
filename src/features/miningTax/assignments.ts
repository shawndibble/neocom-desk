/**
 * Assignment CRUD for the Moon Mining Tax ledger (issue #523): links a Mining
 * Ledger Entry (or a split slice of its ore lines) to a Payee, snapshotting
 * tax % and Jita-priced ISK value **at assignment time** (invoice semantics —
 * see `engine/miningTax/valuation.ts`).
 */
import { db, type MiningTaxAssignmentRecord, type MiningTaxOreLine } from '@/db';
import { markMiningTaxAssignmentDeleted, scheduleSync } from '@/sync';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { linesClaimedBy } from '@/engine/miningTax/rowStatus';
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
  /** "I already sent this in-game" — the Assign dialog's default-on checkbox (decision doc). */
  markPaid: boolean;
}

/** Creates one Assignment, snapshotting Jita price + tax right now. */
export async function createAssignment(input: AssignInput): Promise<MiningTaxAssignmentRecord> {
  const prices = await loadJitaUnitPrices(input.oreLines.map((line) => line.typeId));
  const { estimatedValue, taxOwed } = computeAssignmentValue(input.oreLines, prices, input.taxPct);
  const now = Date.now();
  const record: MiningTaxAssignmentRecord = {
    id: crypto.randomUUID(),
    characterId: input.characterId,
    date: input.date,
    solarSystemId: input.solarSystemId,
    payeeId: input.payeeId,
    oreLines: input.oreLines,
    taxPct: input.taxPct,
    estimatedValue,
    taxOwed,
    status: input.markPaid ? 'paid' : 'outstanding',
    ...(input.markPaid ? { paidAt: now } : {}),
    updatedAt: now,
  };
  await db.miningTaxAssignments.put(record);
  scheduleSync(input.characterId);
  return record;
}

/**
 * Marks several Assignments paid at once — the itemized bulk-pay confirmation
 * commits through this. Never a single blind "mark all paid": the caller is
 * responsible for having shown the itemized list (payee/character/date
 * range/total) before calling this.
 */
export async function markAssignmentsPaid(
  assignments: readonly MiningTaxAssignmentRecord[]
): Promise<void> {
  if (assignments.length === 0) return;
  const now = Date.now();
  const updated = assignments.map((a): MiningTaxAssignmentRecord => ({
    ...a,
    status: 'paid',
    paidAt: now,
    updatedAt: now,
  }));
  await db.miningTaxAssignments.bulkPut(updated);
  for (const characterId of new Set(assignments.map((a) => a.characterId)))
    scheduleSync(characterId);
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
 */
export async function resolveNeedsReview(
  assignment: MiningTaxAssignmentRecord,
  freshEntry: MiningLedgerEntry
): Promise<void> {
  const relevantFresh = linesClaimedBy(assignment.oreLines, freshEntry.oreLines);
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
