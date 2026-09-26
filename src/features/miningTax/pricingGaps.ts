/**
 * Which Mining Ledger Entries the "some ore could not be priced" banner is
 * about. The banner names ore types per hub, which says nothing about *where*
 * to go fix it: the table shows an entry's total value, not per-ore prices, so
 * a pilot cannot find the row from a type name alone. This walks the rows the
 * table shows and reports, per row, the ore types valued at 0 (no orders at
 * all) and those valued at today's sell for want of a buy side — read at the
 * row's own Payee's hub and mined date, the same lookup that priced the row.
 */
import type { DisplayRow } from './groupRows';

export interface PricingGap {
  row: DisplayRow;
  /** Raw typeIds on this entry priced at 0 — bills nothing for that ore until the pilot sets the value by hand. */
  unpriced: number[];
  /** Raw typeIds on this entry valued at today's sell — an estimate the pilot may want to override. */
  sellFallback: number[];
}

export interface PricingGapLookups {
  /** The hub a row bills at — its Payee's, or undefined (Jita) for an unassigned or dismissed row. */
  hubIdOf: (row: DisplayRow) => string | undefined;
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
    const { date } = row.row.entry;
    const hubId = hubIdOf(row);
    const prices = pricesAt(hubId, date);
    const sold = sellFallbackAt(hubId, date);
    const lines = row.row.entry.oreLines;
    const unpriced = lines.filter((l) => (prices.get(l.typeId) ?? 0) <= 0).map((l) => l.typeId);
    const sellFallback = lines.filter((l) => sold.has(l.typeId)).map((l) => l.typeId);
    if (unpriced.length > 0 || sellFallback.length > 0) gaps.push({ row, unpriced, sellFallback });
  }
  return gaps;
}
