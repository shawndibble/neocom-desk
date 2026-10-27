/**
 * "Who do I owe, and how much" (issue #523's Balances strip): per Payee, the
 * sum of every currently-Outstanding Assignment's `taxOwed` — a balance to
 * settle now, deliberately not the running total across every status the
 * earlier stat panels showed. Pure, so the strip's figures are testable
 * without the route's snapshot loading.
 */
import type { PayeeRecord } from '@/db';
import { allMembers, type DisplayRow, type GroupMember } from './groupRows';

export interface PayeeBalance {
  payee: PayeeRecord;
  /** Sum of `taxOwed` across `members`. 0 for a settled Payee. */
  owed: number;
  /** The Outstanding Assignments behind `owed` — exactly what "Settle up" pays. */
  members: GroupMember[];
}

export interface UnassignedSummary {
  entryCount: number;
  /** Jita-priced value of the still-unassigned ore, so a reader sees what the balances don't yet count. */
  estimatedValue: number;
}

/**
 * One balance per known Payee, owed-first then by name, settled Payees
 * included (owed 0) so the strip can offer to show them. An Assignment whose
 * Payee is no longer known is skipped rather than invented — the table still
 * shows it as "Unknown Payee".
 */
export function computePayeeBalances(
  rows: readonly DisplayRow[],
  payees: readonly PayeeRecord[]
): PayeeBalance[] {
  const byPayee = new Map<string, PayeeBalance>(
    payees.map((payee) => [payee.id, { payee, owed: 0, members: [] }])
  );
  for (const dr of rows) {
    for (const member of allMembers(dr)) {
      if (member.assignment.status !== 'outstanding' || !member.assignment.payeeId) continue;
      const balance = byPayee.get(member.assignment.payeeId);
      if (!balance) continue;
      balance.owed += member.assignment.taxOwed;
      balance.members.push(member);
    }
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
