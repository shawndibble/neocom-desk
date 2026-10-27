import type { MiningTaxAssignmentRecord } from '@/db';

/**
 * The tax percentages worth offering as quick picks for a Payee: every
 * distinct rate the pilot has billed that Payee at (a landlord can charge 5%
 * at one moon and 8% at another), plus the Payee's default, ascending.
 * Dismissed assignments carry no Payee's rate and are skipped.
 */
export function ratesForPayee(
  assignments: readonly MiningTaxAssignmentRecord[],
  payeeId: string,
  defaultTaxPct: number
): number[] {
  const rates = new Set<number>([defaultTaxPct]);
  for (const a of assignments) {
    if (a.payeeId === payeeId && a.status !== 'dismissed') rates.add(a.taxPct);
  }
  return [...rates].sort((x, y) => x - y);
}
