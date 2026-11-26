import type { MiningTaxAssignmentRecord } from '@/db';
import type { DisplayRow } from './groupRows';

export interface PricingGap {
  row: DisplayRow;
  unpriced: number[];
  sellFallback: number[];
}

export interface PricingGapLookups {
  hubIdOf: (assignment: MiningTaxAssignmentRecord | null) => string | undefined;
  pricesAt: (hubId: string | undefined, date: string) => ReadonlyMap<number, number>;
  sellFallbackAt: (hubId: string | undefined, date: string) => ReadonlySet<number>;
}

export function findPricingGaps(
  rows: readonly DisplayRow[],
  { hubIdOf, pricesAt, sellFallbackAt }: PricingGapLookups
): PricingGap[] {
  const gaps: PricingGap[] = [];
  for (const row of rows) {
    if (row.status === 'dismissed') continue;
    const unpriced = new Set<number>();
    const sellFallback = new Set<number>();
    const members = [{ row: row.row, assignment: row.assignment }, ...(row.groupMembers ?? [])];
    for (const member of members) {
      const { date } = member.row.entry;
      const hubId = hubIdOf(member.assignment);
      const prices = pricesAt(hubId, date);
      const sellPriced = sellFallbackAt(hubId, date);
      const lines = member.assignment ? member.assignment.oreLines : member.row.unassignedOreLines;
      for (const { typeId } of lines) {
        if ((prices.get(typeId) ?? 0) <= 0) unpriced.add(typeId);
        else if (sellPriced.has(typeId)) sellFallback.add(typeId);
      }
    }
    if (unpriced.size > 0 || sellFallback.size > 0) {
      gaps.push({ row, unpriced: [...unpriced], sellFallback: [...sellFallback] });
    }
  }
  return gaps;
}
