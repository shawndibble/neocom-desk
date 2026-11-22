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
import { readCompressedOre, withOreFormMarker } from './oreForm';
import type { PayeeRunningAccounts } from './payeeRunningAccounts';
import { putAssignments } from './storedAssignments';

export async function repriceForOreForm(
  characterId: number,
  /** What is paid, off the Payees' accounts: a paid day's bill stays as it was priced. */
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
    } catch {
      // No prices reachable right now: keep the old value, retry next load.
    }
  }
  if (updates.length === 0) return;
  // Prices were awaited above, so each row is re-read and only written if it is
  // still the Outstanding record we priced: a pay, a sync pull, a coalesce or a
  // delete in between wins over this write.
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
