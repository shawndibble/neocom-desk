/**
 * Which Mining Ledger Entries the "some ore could not be priced" banner is
 * about. The banner names ore types per hub, which says nothing about *where*
 * to go fix it: the table shows an entry's total value, not per-ore prices, so
 * a pilot cannot find the row from a type name alone. This walks the rows the
 * table shows and reports, per row, the ore types valued at 0 (no orders at
 * all) and those valued at today's sell for want of a buy side — read at the
 * row's own Payee's hub and mined date, the same lookup that priced the row.
 */
import type { MiningTaxAssignmentRecord } from '@/db';
import type { DisplayRow } from './groupRows';

export interface PricingGap {
  row: DisplayRow;
  /** Raw typeIds on this entry priced at 0 — bills nothing for that ore until the pilot sets the value by hand. */
  unpriced: number[];
  /** Raw typeIds on this entry valued at today's sell — an estimate the pilot may want to override. */
  sellFallback: number[];
}

export interface PricingGapLookups {
  /** The hub an Assignment bills at — its Payee's, or undefined (Jita) for no Assignment or a dismissal. */
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
    // A dismissal owes no tax, so a missing price on it costs nobody anything.
    if (row.status === 'dismissed') continue;
    const unpriced = new Set<number>();
    const sellFallback = new Set<number>();
    // A joined group is one display row but several entries, each billed at
    // its own Payee's hub; the link still opens the one combined row.
    const members = [{ row: row.row, assignment: row.assignment }, ...(row.groupMembers ?? [])];
    for (const member of members) {
      const { date } = member.row.entry;
      const hubId = hubIdOf(member.assignment);
      const prices = pricesAt(hubId, date);
      const sellPriced = sellFallbackAt(hubId, date);
      // Only the ore this Assignment bills for: on an entry split across
      // Payees the rest belongs to someone else, possibly at another hub.
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
