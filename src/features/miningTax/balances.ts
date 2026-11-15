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
 *
 * `alsoBilled` is the share of an Assignment's tax a Corp Tax Book bills too (#6204): that part
 * is owed to the corporation, so it is not owed to this Payee as well; an Assignment the book
 * bills whole drops out.
 */
export function computePayeeBalances(
  rows: readonly DisplayRow[],
  payees: readonly PayeeRecord[],
  alsoBilled: (member: GroupMember) => number = () => 0
): PayeeBalance[] {
  const byPayee = new Map<string, PayeeBalance>(
    payees.map((payee) => [payee.id, { payee, owed: 0, members: [] }])
  );
  for (const dr of rows) {
    for (const member of allMembers(dr)) {
      if (member.assignment.status !== 'outstanding' || !member.assignment.payeeId) continue;
      const balance = byPayee.get(member.assignment.payeeId);
      if (!balance) continue;
      const share = Math.min(1, alsoBilled(member));
      const owed = member.assignment.taxOwed * (1 - share);
      if (share > 0 && owed < 0.01) continue;
      balance.owed += owed;
      // Settle up pays what is left for this Payee, not what the book bills too.
      balance.members.push(
        share > 0 ? { ...member, assignment: { ...member.assignment, taxOwed: owed } } : member
      );
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
