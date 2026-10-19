/**
 * The Items board's row derivation: the filter folded into
 * rows, per-type stats and the cheapest-first display order. Split out of
 * `ContractSearchPanel`; every input is still owned there.
 */
import { useMemo } from 'react';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import {
  contractOfferStats,
  filterContractOffers,
  isUnpricedOffer,
  offerAskingPrice,
  type ContractOfferFilter,
  type ContractOfferStats,
  type ContractSaleKind,
} from '@/engine/contracts/contractSearch';
import { withinJumpRange } from '@/engine/route/jumpRange';
import type { OfferLocation } from '@/features/contractSearch/offerLocations';
import type { useOfferIndex } from '@/features/contractSearch/useIndexedOffers';
import { parseNumeric } from '@/features/contractSearch/courierFilterHelpers';

/**
 * `offerAskingPrice`, except an unpriced (barter) row sorts last rather than
 * at its literal 0 (issue #1080) — used only for the fixed, ascending
 * "cheapest first" default view below (`displayRows`), a plain array
 * `.sort()` this `Infinity` sentinel is safe for. `DataTable`'s own
 * reversible column sort must not use this: `sortValueForPriceColumn` in `useItemsColumns`
 * returns `undefined` for that instead, since `Infinity` would sort
 * *first* the moment a pilot clicks the Price header to flip it to
 * descending — the exact bug this fix removes, reintroduced from the
 * other direction.
 */
function sortablePrice(row: PublicContractOfferRow, plexPrice: number | null): number {
  return isUnpricedOffer(row, plexPrice) ? Infinity : offerAskingPrice(row, plexPrice);
}

/** The filter fields that narrow rows; the panel's `UiFilter` is a superset. */
interface RowsFilter {
  regionId: number | null;
  maxPrice: string;
  minQuantity: string;
  saleKind: ContractSaleKind | null;
  hideAuctions: boolean;
  hidePlex: boolean;
}

interface ContractSearchRowsInput {
  uiFilter: RowsFilter;
  rows: readonly PublicContractOfferRow[];
  haveFull: boolean;
  offerIndex: ReturnType<typeof useOfferIndex>;
  /** Rows read through R2 before the full snapshot lands; `null` when none were. */
  earlyRows: readonly PublicContractOfferRow[] | null;
  plexPrice: number | null;
  offerLocations: ReadonlyMap<number, OfferLocation>;
  /** `jumpRangeFilter.allowed`: `null` when no range is active. */
  allowedSystems: Parameters<typeof withinJumpRange>[1] | null;
  typeIds: ReadonlySet<number> | null;
  belowMarket: boolean;
}

export function useContractSearchRows({
  uiFilter,
  rows,
  haveFull,
  offerIndex,
  earlyRows,
  plexPrice,
  offerLocations,
  allowedSystems,
  typeIds,
  belowMarket,
}: ContractSearchRowsInput) {
  /**
   * Everything except the item type. Split out so a keystroke in the search
   * box re-runs only the cheap type narrowing below rather than a fresh pass
   * over the whole snapshot — and so the suggestion list's counts are
   * computed against the same region/price/kind restrictions the results
   * are, which is what stops a suggestion reading "40 offers" from landing on
   * a table of two.
   */
  const nonTypeFilter = useMemo<ContractOfferFilter>(
    () => ({
      regionId: uiFilter.regionId,
      maxPrice: parseNumeric(uiFilter.maxPrice),
      minQuantity: parseNumeric(uiFilter.minQuantity),
      saleKind: uiFilter.saleKind,
      hideAuctions: uiFilter.hideAuctions,
      hidePlexRequests: uiFilter.hidePlex,
      plexPrice,
    }),
    [
      uiFilter.regionId,
      uiFilter.maxPrice,
      uiFilter.minQuantity,
      uiFilter.saleKind,
      uiFilter.hideAuctions,
      uiFilter.hidePlex,
      plexPrice,
    ]
  );
  /**
   * Jump Range folded in here rather than into `nonTypeFilter`/the engine:
   * only this layer resolves an offer's system (`useOfferLocations`), so
   * `filterContractOffers` cannot see it. A row this app has *placed* and
   * cannot connect to the origin — a player structure, or a system the
   * stargate graph does not reach — drops out the moment a range is active:
   * "within 5 jumps" is a claim an unknown distance cannot back.
   *
   * A row still *resolving* (no entry in `offerLocations` yet) is a
   * different case and stays. `useOfferLocations` can still be working
   * through the snapshot's ids while the distances have already landed, and
   * dropping an unresolved row here would read as "nothing in range" for an
   * answer that has simply not arrived yet — the same "only a finished
   * answer excludes" rule Courier's `narrowToOverRate` follows for its own
   * mid-load rows.
   */
  const nonTypeRows = useMemo(() => {
    const engineFiltered = filterContractOffers(rows, nonTypeFilter);
    const allowed = allowedSystems;
    if (allowed === null) return engineFiltered;
    return engineFiltered.filter((row) => {
      const location = offerLocations.get(row.locationId);
      return location === undefined || withinJumpRange(location.systemId, allowed);
    });
  }, [rows, nonTypeFilter, offerLocations, allowedSystems]);
  const statsByType = useMemo(() => {
    // Before the full rows land, the index's own per-type count and cheapest
    // stand in. They ignore the other filters, which only matters until the
    // snapshot arrives and the stats are computed as before.
    if (!haveFull && offerIndex) {
      const stats = new Map<number, ContractOfferStats>(
        [...offerIndex.types.values()].map((entry) => [
          entry.typeId,
          { offerCount: entry.count, cheapest: entry.cheapest },
        ])
      );
      // Read through R2 the full rows never arrive, so the types whose rows
      // were read get their real, filter-aware stats; the rest keep the index's.
      if (earlyRows !== null) {
        for (const [typeId, typeStats] of contractOfferStats(nonTypeRows, plexPrice)) {
          stats.set(typeId, typeStats);
        }
      }
      return stats;
    }
    return contractOfferStats(nonTypeRows, plexPrice);
  }, [haveFull, offerIndex, earlyRows, nonTypeRows, plexPrice]);

  /**
   * Cheapest first, so the rows arrive in the order the table's default
   * sort shows them rather than the snapshot's own contract-then-type order.
   *
   * An unpriced (barter) row sorts last regardless of its raw price (issue
   * #1080): its 0 ISK is not a real price, and sorting on it as one would
   * put the row asking for goods at the very top of the default view — the
   * harm this fix exists to remove.
   */
  const displayRows = useMemo(() => {
    const filtered = filterContractOffers(nonTypeRows, { typeIds });
    // Below market only reads which contracts pass; the offer table is not shown.
    if (belowMarket) return filtered;
    return filtered.sort((a, b) => sortablePrice(a, plexPrice) - sortablePrice(b, plexPrice));
  }, [nonTypeRows, typeIds, plexPrice, belowMarket]);

  return { nonTypeFilter, nonTypeRows, statsByType, displayRows };
}
