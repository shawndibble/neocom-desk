import type { MiningTaxAssignmentRecord } from '@/db';
import { db } from '@/db';
import { planDefaultAssign } from '@/engine/miningTax/defaultSystems';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { loadDefaultOptOuts } from './defaultOptOuts';
import { assign } from './ledgerActions';
import { readCompressedOre } from './oreForm';
import { loadPayees } from './payees';
import { loadPayeeRunningAccounts } from './paymentLinkStore';
import type { PayeeRunningAccounts } from './payeeRunningAccounts';
import { hubForPayee, loadUnitPricesOnDate } from './pricing';

export async function applyDefaultSystems(
  ledgers: readonly { characterId: number; entries: readonly MiningLedgerEntry[] }[],
  accounts?: Pick<PayeeRunningAccounts, 'isBookOwned'>
): Promise<MiningTaxAssignmentRecord[]> {
  const created: MiningTaxAssignmentRecord[] = [];
  const optedOut = await loadDefaultOptOuts();
  for (const ledger of ledgers) {
    if (ledger.entries.length === 0) continue;
    const owner = accounts ?? (await loadPayeeRunningAccounts());
    const payees = (await loadPayees(ledger.characterId)).filter((p) => !owner.isBookOwned(p.id));
    if (!payees.some((p) => p.defaultSystems?.length)) continue;
    const assignments = await db.miningTaxAssignments
      .where('characterId')
      .equals(ledger.characterId)
      .toArray();
    const slices = planDefaultAssign(ledger.entries, assignments, payees, optedOut);
    if (slices.length === 0) continue;
    const compressed = await readCompressedOre();
    for (const slice of slices) {
      const payee = payees.find((p) => p.id === slice.payeeId);
      if (!payee) continue;
      try {
        const { prices } = await loadUnitPricesOnDate(
          slice.oreLines.map((line) => line.typeId),
          hubForPayee(payee.hubId),
          slice.date,
          compressed
        );
        const value = computeAssignmentValue(slice.oreLines, prices, payee.defaultTaxPct);
        const result = await assign({
          characterId: slice.characterId,
          date: slice.date,
          solarSystemId: slice.solarSystemId,
          payeeId: payee.id,
          oreLines: slice.oreLines,
          entryOreLines: slice.entryOreLines,
          taxPct: payee.defaultTaxPct,
          estimatedValue: value.estimatedValue,
          taxOwed: value.taxOwed,
          byDefault: true,
        });
        if (result.ok) created.push(result.value);
      } catch {}
    }
  }
  return created;
}
