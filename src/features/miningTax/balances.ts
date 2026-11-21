/**
 * "Who do I owe, and how much" (issue #523's Balances strip): per Payee, what its account owes
 * now, oldest day first (decision 20261120-235011). Pure, so the strip's figures are testable
 * without the route's snapshot loading.
 */
import type { PayeeRecord } from '@/db';
import type { PayeeAccount } from '@/engine/miningTax/payeeAccount';
import { isCorpPayeeId } from './corpBook/corpRows';
import { allMembers, type DisplayRow, type GroupMember } from './groupRows';
import type { PayeeAccounts } from './payeeAccounts';

export interface PayeeBalance {
  payee: PayeeRecord;
  /** What its account owes now (a Corp Tax Book's: what its rows still owe). 0 for a settled Payee. */
  owed: number;
  /** The Outstanding Assignments behind `owed`, in view. */
  members: GroupMember[];
  /** A personal Payee's Running account; absent for a Corp Tax Book's and one nothing bills. */
  account?: PayeeAccount;
}

export interface UnassignedSummary {
  entryCount: number;
  /** Jita-priced value of the still-unassigned ore, so a reader sees what the balances don't yet count. */
  estimatedValue: number;
}

/**
 * One balance per known Payee, owed-first then by name, settled Payees included (owed 0) so the
 * strip can offer to show them. A personal Payee owes what its Running account owes, oldest day
 * first; a Corp Tax Book's owes what its rows still owe (the book's account already paid them).
 * A Payee with nothing Outstanding in view owes nothing here. An Assignment whose Payee is no
 * longer known is skipped rather than invented: the table still shows it as "Unknown Payee".
 */
export function computePayeeBalances(
  rows: readonly DisplayRow[],
  payees: readonly PayeeRecord[],
  accounts: PayeeAccounts,
  /** Payee ids that are another record of the same Payee (`payeeDuplicateAliases`): summed into it. */
  aliases: ReadonlyMap<string, string> = new Map()
): PayeeBalance[] {
  const byPayee = new Map<string, PayeeBalance>(
    payees
      .filter((payee) => !aliases.has(payee.id))
      .map((payee) => [payee.id, { payee, owed: 0, members: [] }])
  );
  for (const dr of rows) {
    for (const member of allMembers(dr)) {
      if (member.assignment.status !== 'outstanding' || !member.assignment.payeeId) continue;
      const balance = byPayee.get(
        aliases.get(member.assignment.payeeId) ?? member.assignment.payeeId
      );
      balance?.members.push(member);
    }
  }
  for (const balance of byPayee.values()) {
    if (balance.members.length === 0) continue;
    if (isCorpPayeeId(balance.payee.id)) {
      balance.owed = balance.members.reduce((sum, m) => sum + m.assignment.taxOwed, 0);
      continue;
    }
    const account = accounts.of(balance.payee.id);
    if (!account) continue;
    balance.account = account;
    balance.owed = account.owes?.amount ?? 0;
  }
  return [...byPayee.values()].sort(
    (a, b) => b.owed - a.owed || a.payee.name.localeCompare(b.payee.name)
  );
}

export function summarizeUnassigned(
  rows: readonly DisplayRow[],
  estimatedValueOf: (dr: DisplayRow) => number
): UnassignedSummary {
  let entryCount = 0;
  let estimatedValue = 0;
  for (const dr of rows) {
    if (dr.status !== 'unassigned') continue;
    entryCount += 1;
    estimatedValue += estimatedValueOf(dr);
  }
  return { entryCount, estimatedValue };
}
