/**
 * Repairs a character's stored Assignments into a shape the ledger can
 * actually render, once per load (`snapshot.ts`, just before
 * `reconcileAssignments`). Two things it puts right — the rules themselves
 * live in `engine/miningTax/coalesce.ts`:
 *
 * - **Ejection.** A joined group is one obligation to one Payee at one rate,
 *   and the table draws it as a single row under a single Payee name. Editing
 *   one member's Payee used to leave it inside the group regardless, so the
 *   row went on claiming ore had gone somewhere it had not. A member on
 *   different terms loses its `groupId` and stands as its own row.
 * - **Fusion.** Two Assignments over one Mining Ledger Entry on identical
 *   terms are one obligation stored as two — what a day split to a second
 *   Payee and then moved back becomes. They are written back as one record,
 *   quantities and snapshots summed.
 *
 * Run as eject, fuse, eject: a dissolved group's two halves have to be free
 * of their `groupId` before they can fuse, and fusing can itself leave a group
 * holding a single member, which is no longer a group. Both steps are
 * idempotent, so a healthy ledger writes nothing and triggers no sync.
 */
import { db, type MiningTaxAssignmentRecord } from '@/db';
import { markMiningTaxAssignmentDeleted, scheduleSync } from '@/sync';
import {
  planEntryMerges,
  planGroupEjections,
  type CoalescableAssignment,
} from '@/engine/miningTax/coalesce';

function coalescable(a: MiningTaxAssignmentRecord): CoalescableAssignment {
  return {
    id: a.id,
    characterId: a.characterId,
    date: a.date,
    solarSystemId: a.solarSystemId,
    payeeId: a.payeeId,
    taxPct: a.taxPct,
    status: a.status,
    groupId: a.groupId,
    oreLines: a.oreLines,
    estimatedValue: a.estimatedValue,
    taxOwed: a.taxOwed,
    collectsGrowth: a.collectsGrowth,
    hasPayment: a.payment !== undefined,
  };
}

export async function coalesceAssignments(characterId: number): Promise<void> {
  const assignments = await db.miningTaxAssignments
    .where('characterId')
    .equals(characterId)
    .toArray();
  if (assignments.length === 0) return;

  const working = new Map(assignments.map((a) => [a.id, a]));
  const rewritten = new Set<string>();
  const absorbedIds: string[] = [];
  const now = Date.now();
  const current = () => [...working.values()].map(coalescable);

  function eject() {
    for (const id of planGroupEjections(current())) {
      const ejected = { ...working.get(id)!, updatedAt: now };
      delete ejected.groupId;
      working.set(id, ejected);
      rewritten.add(id);
    }
  }

  eject();
  for (const merge of planEntryMerges(current())) {
    const keep: MiningTaxAssignmentRecord = {
      ...working.get(merge.keepId)!,
      oreLines: merge.oreLines,
      estimatedValue: merge.estimatedValue,
      taxOwed: merge.taxOwed,
      updatedAt: now,
    };
    if (merge.collectsGrowth) keep.collectsGrowth = true;
    else delete keep.collectsGrowth;
    if (merge.groupId !== undefined) keep.groupId = merge.groupId;
    else delete keep.groupId;
    working.set(keep.id, keep);
    rewritten.add(keep.id);
    for (const id of merge.absorbedIds) {
      working.delete(id);
      rewritten.delete(id);
      absorbedIds.push(id);
    }
  }
  eject();

  if (rewritten.size === 0 && absorbedIds.length === 0) return;

  await db.miningTaxAssignments.bulkPut([...rewritten].map((id) => working.get(id)!));
  // Tombstoned rather than plainly dropped: the absorbed halves may already
  // have synced, and a bare local delete would let the next pull resurrect
  // them beside the record that now holds their ore.
  for (const id of absorbedIds) await markMiningTaxAssignmentDeleted(characterId, id);
  scheduleSync(characterId);
}
