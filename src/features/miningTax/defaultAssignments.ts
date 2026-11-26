import type { MiningTaxAssignmentRecord } from '@/db';
import { db } from '@/db';
import { planDefaultAssign } from '@/engine/miningTax/defaultSystems';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';
import { autoAssignSlice } from './autoAssignSlice';
import { loadDefaultOptOuts } from './defaultOptOuts';
import { readCompressedOre } from './oreForm';
import { loadPayees } from './payees';
import { loadPayeeRunningAccounts } from './paymentLinkStore';
import type { PayeeRunningAccounts } from './payeeRunningAccounts';

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
        const result = await autoAssignSlice({
          characterId: slice.characterId,
          date: slice.date,
          solarSystemId: slice.solarSystemId,
          payee,
          oreLines: slice.oreLines,
          entryOreLines: slice.entryOreLines,
          taxPct: payee.defaultTaxPct,
          compressed,
          byDefault: true,
        });
        if (result?.ok) created.push(result.value);
      } catch {}
    }
  }
  return created;
}
