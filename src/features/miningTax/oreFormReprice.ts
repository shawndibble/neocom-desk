import { db, type MiningTaxAssignmentRecord } from '@/db';
import { scheduleSync } from '@/sync';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { loadPayees } from './payees';
import { hubForPayee, loadUnitPricesOnDate } from './pricing';
import { readCompressedOre, withOreFormMarker } from './oreForm';
import type { PayeeRunningAccounts } from './payeeRunningAccounts';
import { putAssignments } from './storedAssignments';

export async function repriceForOreForm(
  characterId: number,
  accounts: Pick<PayeeRunningAccounts, 'statusOf'>
): Promise<void> {
  const compressed = await readCompressedOre();
  const owed = (a: MiningTaxAssignmentRecord) => accounts.statusOf(a) === 'outstanding';
  const stale = (
    await db.miningTaxAssignments.where('characterId').equals(characterId).toArray()
  ).filter((a) => owed(a) && !a.rawOrePriced !== compressed);
  if (stale.length === 0) return;

  const payees = await loadPayees(characterId);
  const updates: {
    assignment: MiningTaxAssignmentRecord;
    estimatedValue: number;
    taxOwed: number;
  }[] = [];
  for (const assignment of stale) {
    try {
      const payee = payees.find((p) => p.id === assignment.payeeId);
      const { prices, unpriced } = await loadUnitPricesOnDate(
        assignment.oreLines.map((line) => line.typeId),
        hubForPayee(payee?.hubId),
        assignment.date,
        compressed
      );
      if (unpriced.size > 0) continue;
      const overrides = assignment.oreLineValues
        ? new Map(Object.entries(assignment.oreLineValues).map(([id, v]) => [Number(id), v]))
        : undefined;
      const { estimatedValue, taxOwed } = computeAssignmentValue(
        assignment.oreLines,
        prices,
        assignment.taxPct,
        overrides
      );
      updates.push({ assignment, estimatedValue, taxOwed });
    } catch {}
  }
  if (updates.length === 0) return;
  let wrote = false;
  await db.transaction('rw', db.miningTaxAssignments, db.settings, async () => {
    for (const { assignment, estimatedValue, taxOwed } of updates) {
      const live = await db.miningTaxAssignments.get(assignment.id);
      if (!live || !owed(live) || live.updatedAt !== assignment.updatedAt) continue;
      await putAssignments([
        withOreFormMarker({ ...live, estimatedValue, taxOwed, updatedAt: Date.now() }, compressed),
      ]);
      wrote = true;
    }
  });
  if (wrote) scheduleSync(characterId, { collections: ['miningTaxAssignments'] });
}
