import type { MiningTaxAssignmentRecord } from '@/db';
import { assignmentsMovedWithPayee } from '@/features/miningTax/ledgerActions';
import type { PayeeOwed } from '@/features/miningTax/PayeeManagerDialog';

/**
 * Every Payee's owed total, entry count and how many entries would move with it, for the Payee
 * manager's rows. `alsoBilled` is the share of an Assignment's tax a Corp Tax Book bills too
 * (#6204): it is owed to the corporation, not to this Payee as well, as on the balance cards.
 */
export function computeOwedByPayee(
  everyAssignment: readonly MiningTaxAssignmentRecord[],
  alsoBilled: (assignment: MiningTaxAssignmentRecord) => number = () => 0
): Map<string, PayeeOwed> {
  const out = new Map<string, PayeeOwed>();
  for (const a of everyAssignment) {
    // Owed means Outstanding, as on the balance cards: a needs-review entry
    // was already paid (or dismissed) before it grew.
    if (!a.payeeId || a.status !== 'outstanding') continue;
    const share = Math.min(1, alsoBilled(a));
    const owed = a.taxOwed * (1 - share);
    if (share > 0 && owed < 0.01) continue;
    const entry = out.get(a.payeeId) ?? { amount: 0, count: 0, moving: 0 };
    entry.amount += owed;
    entry.count += 1;
    out.set(a.payeeId, entry);
  }
  for (const [payeeId, entry] of out) {
    entry.moving = assignmentsMovedWithPayee(everyAssignment, payeeId).length;
  }
  return out;
}
