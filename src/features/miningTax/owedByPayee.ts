import type { MiningTaxAssignmentRecord } from '@/db';
import { assignmentsMovedWithPayee } from '@/features/miningTax/ledgerActions';
import type { PayeeOwed } from '@/features/miningTax/PayeeManagerDialog';
import type { PayeeAccounts } from './payeeAccounts';

/**
 * Every Payee record's owed total, entry count and how many entries would move with it, for the
 * Payee manager's rows: each Outstanding Assignment owes its share of what its Payee's account
 * still owes of its day, as on the balance cards.
 */
export function computeOwedByPayee(
  everyAssignment: readonly MiningTaxAssignmentRecord[],
  accounts: PayeeAccounts
): Map<string, PayeeOwed> {
  const out = new Map<string, PayeeOwed>();
  for (const a of everyAssignment) {
    // Owed means Outstanding, as on the balance cards: a needs-review entry waits on the pilot.
    if (!a.payeeId || a.status !== 'outstanding') continue;
    const account = accounts.of(a.payeeId);
    const charge = account?.charges.find((c) => c.id === a.id);
    const owed = account && charge ? account.owedOf(charge) : 0;
    if (owed < 0.01) continue;
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
