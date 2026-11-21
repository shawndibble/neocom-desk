import type { MiningTaxAssignmentRecord } from '@/db';
import { assignmentsMovedWithPayee } from '@/features/miningTax/ledgerActions';
import type { PayeeOwed } from '@/features/miningTax/PayeeManagerDialog';
import { isBilled, type PayeeRunningAccounts } from './payeeRunningAccounts';

/**
 * Every Payee record's owed total, entry count and how many entries would move with it, for the
 * Payee manager's rows. What is owed is its account's (`owes`), as on the balance cards; the count
 * is the entries that bill it and still owe something of their day.
 */
export function computeOwedByPayee(
  everyAssignment: readonly MiningTaxAssignmentRecord[],
  accounts: PayeeRunningAccounts
): Map<string, PayeeOwed> {
  const out = new Map<string, PayeeOwed>();
  for (const a of everyAssignment) {
    if (!a.payeeId || !isBilled(a)) continue;
    const account = accounts.of(a.payeeId);
    const charge = account?.charges.find((c) => c.id === a.id);
    if (!account?.owes || !charge || account.owedOf(charge) < 0.01) continue;
    const entry = out.get(a.payeeId) ?? { amount: account.owes.amount, count: 0, moving: 0 };
    entry.count += 1;
    out.set(a.payeeId, entry);
  }
  for (const [payeeId, entry] of out) {
    entry.moving = assignmentsMovedWithPayee(everyAssignment, payeeId, (a) =>
      accounts.statusOf(a)
    ).length;
  }
  return out;
}
