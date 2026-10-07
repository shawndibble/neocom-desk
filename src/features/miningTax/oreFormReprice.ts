/**
 * Re-prices a character's Outstanding Assignments when the Ore Form setting
 * differs from the form they were priced under (decision 20261006-185915).
 * Paid, dismissed and needs-review ones are frozen on purpose: invoice
 * semantics, and the pilot already decided what to do with them.
 *
 * Run on every snapshot load after `reconcileAssignments`, so a flip made on
 * another device (the setting syncs) catches up here too. A record whose ore
 * has no price right now is left as it is and retried next load, never
 * overwritten with zero.
 */
import { db, type MiningTaxAssignmentRecord } from '@/db';
import { scheduleSync } from '@/sync';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { loadPayees } from './payees';
import { hubForPayee, loadUnitPricesOnDate } from './pricing';
import { readCompressedOre } from './oreForm';

export async function repriceForOreForm(characterId: number): Promise<void> {
  const compressed = await readCompressedOre();
  const stale = (
    await db.miningTaxAssignments.where('characterId').equals(characterId).toArray()
  ).filter((a) => a.status === 'outstanding' && !a.rawOrePriced !== compressed);
  if (stale.length === 0) return;

  const payees = await loadPayees(characterId);
  const updates: MiningTaxAssignmentRecord[] = [];
  for (const assignment of stale) {
    try {
      const payee = payees.find((p) => p.id === assignment.payeeId);
      const { prices, unpriced } = await loadUnitPricesOnDate(
        characterId,
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
      const next: MiningTaxAssignmentRecord = {
        ...assignment,
        estimatedValue,
        taxOwed,
        updatedAt: Date.now(),
      };
      if (compressed) delete next.rawOrePriced;
      else next.rawOrePriced = true;
      updates.push(next);
    } catch {
      // No prices reachable right now: keep the old value, retry next load.
    }
  }
  if (updates.length === 0) return;
  await db.miningTaxAssignments.bulkPut(updates);
  scheduleSync(characterId);
}
