import type { MiningTaxAssignmentRecord } from '@/db';
import { assignmentsMovedWithPayee } from '@/features/miningTax/ledgerActions';
import type { PayeeOwed } from '@/features/miningTax/PayeeManagerDialog';

/** Every Payee's owed total, entry count and how many entries would move with it, for the Payee manager's rows. */
export function computeOwedByPayee(
  everyAssignment: readonly MiningTaxAssignmentRecord[]
): Map<string, PayeeOwed> {
  const out = new Map<string, PayeeOwed>();
  for (const a of everyAssignment) {
    // Owed means Outstanding, as on the balance cards: a needs-review entry
    // was already paid (or dismissed) before it grew.
    if (!a.payeeId || a.status !== 'outstanding') continue;
    const entry = out.get(a.payeeId) ?? { amount: 0, count: 0, moving: 0 };
    entry.amount += a.taxOwed;
    entry.count += 1;
    out.set(a.payeeId, entry);
  }
  for (const [payeeId, entry] of out) {
    entry.moving = assignmentsMovedWithPayee(everyAssignment, payeeId).length;
  }
  return out;
}
