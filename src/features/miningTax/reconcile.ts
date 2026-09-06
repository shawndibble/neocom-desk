/**
 * Re-diffs every stored Assignment for one character against a fresh set of
 * Mining Ledger Entries, flipping one to `needs-review` (with an explicit
 * before/after diff) whenever ESI now reports more ore than it did when it
 * was assigned or last resolved. For a *sole* Assignment on an entry, "more
 * ore" includes a brand-new ore type that shows up mid-session — a
 * continuous mining session folds into the one existing Assignment instead
 * of spawning a second, separately-assignable row (`linesOwnedByAssignment`,
 * rowStatus.ts). A *split* entry (2+ Assignments) keeps the narrower
 * per-type check, since a brand-new type has no obvious owner among several
 * Payees. Never silently absorbed into `oreLines` either way (decision doc)
 * — only `status`/`reviewDiff` move; `resolveNeedsReview` (assignments.ts) is
 * the one place `oreLines` itself re-snapshots.
 *
 * Run once per character after loading its fresh ledger (see
 * `snapshot.ts`), not on every render — `sameDiffs` skips the write (and the
 * `scheduleSync` it would otherwise trigger) when nothing actually changed.
 */
import { db, type MiningTaxAssignmentRecord } from '@/db';
import { scheduleSync } from '@/sync';
import { diffAssignedOreLines } from '@/engine/miningTax/needsReview';
import { computeOwnership, type Ownership } from '@/engine/miningTax/ownership';
import type { MiningLedgerEntry, QuantityDiff } from '@/engine/miningTax/types';

function sameDiffs(a: readonly QuantityDiff[] | undefined, b: readonly QuantityDiff[]): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every(
    (d, i) => d.typeId === b[i].typeId && d.before === b[i].before && d.after === b[i].after
  );
}

export async function reconcileAssignments(
  characterId: number,
  freshEntries: readonly MiningLedgerEntry[]
): Promise<void> {
  const assignments = await db.miningTaxAssignments
    .where('characterId')
    .equals(characterId)
    .toArray();
  if (assignments.length === 0) return;

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

  for (const assignment of assignments) {
    const key = `${assignment.date}:${assignment.solarSystemId}`;
    // Absent from the fresh read means it aged out of ESI's 90-day retention
    // (or a character's grant lapsed this refresh) — leave the assignment as
    // it stands rather than treat "no fresh data" as "nothing was mined".
    const relevantFresh = ownershipByKey.get(key)?.ownedLines.get(assignment.id);
    if (!relevantFresh) continue;
    const diffs = diffAssignedOreLines(assignment.oreLines, relevantFresh);
    if (diffs.length === 0) continue;
    if (assignment.status === 'needs-review' && sameDiffs(assignment.reviewDiff, diffs)) continue;
    updates.push({ ...assignment, status: 'needs-review', reviewDiff: diffs, updatedAt: now });
  }

  if (updates.length > 0) {
    await db.miningTaxAssignments.bulkPut(updates);
    scheduleSync(characterId);
  }
}
