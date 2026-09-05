/**
 * Re-diffs every stored Assignment for one character against a fresh set of
 * Mining Ledger Entries, flipping one to `needs-review` (with an explicit
 * before/after diff) whenever ESI now reports more ore for a type it already
 * covers than it did when it was assigned or last resolved. Never silently
 * absorbed into `oreLines` (decision doc) — only `status`/`reviewDiff` move;
 * `resolveNeedsReview` (assignments.ts) is the one place `oreLines` itself
 * re-snapshots.
 *
 * Run once per character after loading its fresh ledger (see
 * `snapshot.ts`), not on every render — `sameDiffs` skips the write (and the
 * `scheduleSync` it would otherwise trigger) when nothing actually changed.
 */
import { db, type MiningTaxAssignmentRecord } from '@/db';
import { scheduleSync } from '@/sync';
import { diffAssignedOreLines } from '@/engine/miningTax/needsReview';
import { linesClaimedBy } from '@/engine/miningTax/rowStatus';
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
  const now = Date.now();
  const updates: MiningTaxAssignmentRecord[] = [];

  for (const assignment of assignments) {
    const entry = freshByKey.get(`${assignment.date}:${assignment.solarSystemId}`);
    // Absent from the fresh read means it aged out of ESI's 90-day retention
    // (or a character's grant lapsed this refresh) — leave the assignment as
    // it stands rather than treat "no fresh data" as "nothing was mined".
    if (!entry) continue;
    const relevantFresh = linesClaimedBy(assignment.oreLines, entry.oreLines);
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
