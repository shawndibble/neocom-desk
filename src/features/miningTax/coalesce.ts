import { db, type MiningTaxAssignmentRecord } from '@/db';
import { scheduleSync } from '@/sync';
import { entryKey, type MiningLedgerEntry } from '@/engine/miningTax/types';
import {
  planEntryMerges,
  planGroupEjections,
  type CoalescableAssignment,
} from '@/engine/miningTax/coalesce';
import { deleteAssignments } from './assignments';
import type { PayeeRunningAccounts } from './payeeRunningAccounts';
import { loadPayeeRunningAccounts } from './paymentLinkStore';
import { putAssignments } from './storedAssignments';

function coalescable(
  a: MiningTaxAssignmentRecord,
  accounts: PayeeRunningAccounts
): CoalescableAssignment {
  return {
    id: a.id,
    characterId: a.characterId,
    date: a.date,
    solarSystemId: a.solarSystemId,
    payeeId: a.payeeId,
    taxPct: a.taxPct,
    status: accounts.statusOf(a),
    groupId: a.groupId,
    oreLines: a.oreLines,
    estimatedValue: a.estimatedValue,
    taxOwed: a.taxOwed,
    collectsGrowth: a.collectsGrowth,
  };
}

export async function coalesceAssignments(
  characterId: number,
  entries?: readonly MiningLedgerEntry[],
  accounts?: PayeeRunningAccounts
): Promise<void> {
  const assignments = await db.miningTaxAssignments
    .where('characterId')
    .equals(characterId)
    .toArray();
  if (assignments.length === 0) return;
  const paid = accounts ?? (await loadPayeeRunningAccounts());

  const working = new Map(assignments.map((a) => [a.id, a]));
  const rewritten = new Set<string>();
  const absorbedIds: string[] = [];
  const now = Date.now();
  const current = () => [...working.values()].map((a) => coalescable(a, paid));

  function eject() {
    for (const id of planGroupEjections(current())) {
      const ejected = { ...working.get(id)!, updatedAt: now };
      delete ejected.groupId;
      working.set(id, ejected);
      rewritten.add(id);
    }
  }

  eject();
  const entryLinesByKey = entries
    ? new Map(entries.map((e) => [entryKey(characterId, e.date, e.solarSystemId), e.oreLines]))
    : undefined;
  for (const merge of planEntryMerges(current(), entryLinesByKey)) {
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

  await db.transaction('rw', db.miningTaxAssignments, db.settings, async () => {
    await putAssignments([...rewritten].map((id) => working.get(id)!));
    await deleteAssignments(absorbedIds.map((id) => ({ id, characterId })));
  });
  scheduleSync(characterId, { collections: ['miningTaxAssignments'] });
}
