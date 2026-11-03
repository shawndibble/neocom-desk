/**
 * Default Systems at work (GLOSSARY.md): as a Character's moon ore reaches the Mining Ledger, ore
 * mined in a system one of their Payees defaults is assigned to that Payee, at the Payee's rate
 * and Trade Hub. Run from the Tax tab's load after the Survey connections, so a Survey always
 * has first claim (`snapshot.ts`). What it may touch is planned by `planDefaultAssign`.
 */
import type { MiningTaxAssignmentRecord } from '@/db';
import { db } from '@/db';
import { planDefaultAssign } from '@/engine/miningTax/defaultSystems';
import type { MiningLedgerEntry } from '@/engine/miningTax/types';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { loadDefaultOptOuts } from './defaultOptOuts';
import { assign } from './ledgerActions';
import { readCompressedOre } from './oreForm';
import { loadPayees } from './payees';
import { hubForPayee, loadUnitPricesOnDate } from './pricing';

/**
 * Assigns, for each ledger, what its Character's Default Systems plan, one Assignment per entry,
 * each priced at its Payee's hub on the mined date. Resolves to the Assignments made; an entry
 * that fails to price or save is skipped, and tried again on the next load.
 */
export async function applyDefaultSystems(
  ledgers: readonly { characterId: number; entries: readonly MiningLedgerEntry[] }[]
): Promise<MiningTaxAssignmentRecord[]> {
  const created: MiningTaxAssignmentRecord[] = [];
  const optedOut = await loadDefaultOptOuts();
  for (const ledger of ledgers) {
    if (ledger.entries.length === 0) continue;
    const payees = await loadPayees(ledger.characterId);
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
          markPaid: false,
          byDefault: true,
        });
        if (result.ok) created.push(result.value);
      } catch {
        // No prices yet (offline): the next load tries again.
      }
    }
  }
  return created;
}
