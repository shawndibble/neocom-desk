import type { MiningTaxAssignmentRecord } from '@/db';

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
