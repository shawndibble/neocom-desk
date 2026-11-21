/**
 * Re-diffs every stored Assignment for one character against a fresh set of
 * Mining Ledger Entries, flipping one to `needs-review` (with an explicit
 * before/after diff) whenever ESI now reports more ore than it did when it
 * was assigned or last resolved. For a *sole* Assignment on an entry, "more
 * ore" includes a brand-new ore type that shows up mid-session — a
 * continuous mining session folds into the one existing Assignment instead
 * of spawning a second, separately-assignable row (`computeOwnership`,
 * engine/miningTax/ownership.ts). A *split* entry (2+ Assignments) keeps the
 * narrower per-type check, since a brand-new type has no obvious owner among
 * several Payees. Never silently absorbed into `oreLines` either way (decision doc)
 * — only `status`/`reviewDiff` move; `planNeedsReviewResolution` (assignments.ts) is
 * the one place `oreLines` itself re-snapshots.
 *
 * Paid stays paid (ADR 0024): an Assignment is paid once its day is on or
 * before its Payee's paid-through (`PayeeAccounts`, decision 20261120-235011:
 * no Assignment carries a paid mark of its own), and a paid one is never
 * diffed against more than its own snapshot, because `computeOwnership` never
 * grows one. Its growth is left unassigned instead, and the Tax tab shows it as
 * a new, separately assignable row for the same day and system, so its ore and
 * tax never move here. Combined members and split sides alike.
 *
 * Unpaid growth on a *sole* Assignment skips the flag: it is absorbed straight
 * into the Assignment (`planNeedsReviewResolution`), since an unsettled
 * obligation has no paid history to protect. That includes a member of a
 * combined entry — a session that crossed midnight UTC is usually combined
 * while the second day is still growing (scope decision 20261004, "combined
 * entries absorb unpaid growth"). On a split day (2+ Assignments, paid or
 * not) the Growth Collector's growth is flagged instead: ESI's ledger lags up
 * to an hour (`oreArrival.ts`), so late ore may be another side's, and only
 * the pilot can tell (scope decision 20261115-114019). Dismissed growth still flags.
 *
 * Run once per character after loading its fresh ledger (see
 * `snapshot.ts`), not on every render — `sameDiffs` skips the write (and the
 * `scheduleSync` it would otherwise trigger) when nothing actually changed.
 */
import { db, type MiningTaxAssignmentRecord } from '@/db';
import { scheduleSync } from '@/sync';
import { diffAssignedOreLines } from '@/engine/miningTax/needsReview';
import { computeOwnership, type Ownership } from '@/engine/miningTax/ownership';
import { planNeedsReviewResolution } from './assignments';
import type { PayeeAccounts } from './payeeAccounts';
import { loadPayeeAccounts } from './paymentLinkStore';
import type { MiningLedgerEntry, QuantityDiff } from '@/engine/miningTax/types';

function sameDiffs(a: readonly QuantityDiff[] | undefined, b: readonly QuantityDiff[]): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every(
    (d, i) => d.typeId === b[i].typeId && d.before === b[i].before && d.after === b[i].after
  );
}

export async function reconcileAssignments(
  characterId: number,
  freshEntries: readonly MiningLedgerEntry[],
  /** Every personal Payee's account, which says which days are paid; read from Dexie when absent. */
  accounts?: PayeeAccounts
): Promise<void> {
  const stored = await db.miningTaxAssignments.where('characterId').equals(characterId).toArray();
  if (stored.length === 0) return;
  // Read as the tab reads them: Paid where the Payee's account has paid the day. Only ever
  // written back from the stored record.
  const paid = accounts ?? (await loadPayeeAccounts());
  const assignments = stored.map((a) => paid.view(a));
  const storedById = new Map(stored.map((a) => [a.id, a]));

  const freshByKey = new Map(
    freshEntries.map((entry) => [`${entry.date}:${entry.solarSystemId}`, entry])
  );
  // Every Assignment covering each entry — `computeOwnership` needs the
  // whole set to tell "sole Payee, owns the whole entry" from "split entry,
  // only the collector grows" (see engine/miningTax/ownership.ts).
  const siblingsByKey = new Map<string, MiningTaxAssignmentRecord[]>();
  for (const a of assignments) {
    const key = `${a.date}:${a.solarSystemId}`;
    let siblings = siblingsByKey.get(key);
    if (!siblings) siblingsByKey.set(key, (siblings = []));
    siblings.push(a);
  }
  // Ownership is a property of the entry, so it is worked out once per
  // entry and read per Assignment, not recomputed for each sibling.
  const ownershipByKey = new Map<string, Ownership>();
  for (const [key, siblings] of siblingsByKey) {
    const entry = freshByKey.get(key);
    if (entry) ownershipByKey.set(key, computeOwnership(entry.oreLines, siblings));
  }
  const now = Date.now();
  const updates: MiningTaxAssignmentRecord[] = [];
  const absorbs: { assignment: MiningTaxAssignmentRecord; key: string }[] = [];

  for (const assignment of assignments) {
    const key = `${assignment.date}:${assignment.solarSystemId}`;
    // Absent from the fresh read means it aged out of ESI's 30-day retention
    // (or a character's grant lapsed this refresh) — leave the assignment as
    // it stands rather than treat "no fresh data" as "nothing was mined".
    const relevantFresh = ownershipByKey.get(key)?.ownedLines.get(assignment.id);
    if (!relevantFresh) continue;
    const diffs = diffAssignedOreLines(assignment.oreLines, relevantFresh);
    if (diffs.length === 0) continue;
    if (assignment.status === 'needs-review' && sameDiffs(assignment.reviewDiff, diffs)) continue;
    // A sole Assignment's unpaid growth has no settled history to protect, so
    // it folds straight in. Combined or not: a combined member is billed with
    // its siblings, but its own ore is still only its own day's. On a split
    // day the late ore may belong to another side, so it is reviewed.
    const soleOnItsDay = siblingsByKey.get(key)!.length === 1;
    if (assignment.status === 'outstanding' && soleOnItsDay) {
      absorbs.push({ assignment, key });
      continue;
    }
    updates.push({
      ...storedById.get(assignment.id)!,
      status: 'needs-review',
      reviewDiff: diffs,
      updatedAt: now,
    });
  }

  for (const { assignment, key } of absorbs) {
    const record = storedById.get(assignment.id)!;
    try {
      updates.push(
        await planNeedsReviewResolution(record, freshByKey.get(key)!, siblingsByKey.get(key)!)
      );
    } catch {
      // Re-pricing can fail (no prices yet); fall back to surfacing the growth.
      const diffs = diffAssignedOreLines(
        assignment.oreLines,
        ownershipByKey.get(key)!.ownedLines.get(assignment.id)!
      );
      updates.push({ ...record, status: 'needs-review', reviewDiff: diffs, updatedAt: now });
    }
  }

  if (updates.length > 0) {
    await db.miningTaxAssignments.bulkPut(updates);
    scheduleSync(characterId, { collections: ['miningTaxAssignments'] });
  }
}
