import type { PayeeRecord } from '@/db';
import type { PayeeRunningAccount } from '@/engine/miningTax/payeeRunningAccount';
import { isCorpPayeeId } from './corpBook/corpRows';
import { allMembers, type DisplayRow, type GroupMember } from './groupRows';
import type { PayeeRunningAccounts } from './payeeRunningAccounts';

export interface PayeeBalance {
  payee: PayeeRecord;
  owed: number;
  credit: number;
  members: GroupMember[];
  account?: PayeeRunningAccount;
  book?: BookOwedDays;
}

export interface BookOwedDays {
  days: number;
  oldest: string;
}

export interface UnassignedSummary {
  entryCount: number;
  estimatedValue: number;
}

export function computePayeeBalances(
  rows: readonly DisplayRow[],
  payees: readonly PayeeRecord[],
  accounts: PayeeRunningAccounts,
  aliases: ReadonlyMap<string, string> = new Map(),
  bookCredits: ReadonlyMap<string, number> = new Map(),
  bookOwes: ReadonlyMap<string, number> = new Map(),
  bookDays: ReadonlyMap<string, BookOwedDays> = new Map()
): PayeeBalance[] {
  const byPayee = new Map<string, PayeeBalance>(
    payees
      .filter(
        (payee) =>
          !aliases.has(payee.id) &&
          !accounts.isBookOwned(payee.id) &&
          !accounts.isArchived(payee.id)
      )
      .map((payee) => [payee.id, { payee, owed: 0, credit: 0, members: [] }])
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
    if (isCorpPayeeId(balance.payee.id)) {
      balance.credit = bookCredits.get(balance.payee.id) ?? 0;
      const days = bookDays.get(balance.payee.id);
      if (days) balance.book = days;
      balance.owed =
        bookOwes.get(balance.payee.id) ??
        balance.members.reduce((sum, m) => sum + m.assignment.taxOwed, 0);
      continue;
    }
    const account = accounts.of(balance.payee.id);
    if (!account) continue;
    balance.account = account;
    balance.credit = account.credit;
    if (balance.members.length > 0) balance.owed = account.owes?.amount ?? 0;
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
