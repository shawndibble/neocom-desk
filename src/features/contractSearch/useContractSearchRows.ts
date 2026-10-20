/**
 * The Items board's row derivation: the filter folded into the worker query,
 * per-type stats and the cheapest-first display order. Split out of
 * `ContractSearchPanel`; every input is still owned there.
 */
import { useDeferredValue, useMemo } from 'react';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import type {
  ContractOfferFilter,
  ContractOfferStats,
  ContractSaleKind,
} from '@/engine/contracts/contractSearch';
import type { ContractOfferQuery } from '@/engine/contracts/contractSearchQuery';
import type { withinJumpRange } from '@/engine/route/jumpRange';
import type { OfferLocation } from '@/features/contractSearch/offerLocations';
import type { useOfferIndex } from '@/features/contractSearch/useIndexedOffers';
import { useContractOfferQuery } from '@/features/contractSearch/useContractOfferQuery';
import { parseNumeric } from '@/lib/isk';

const NO_LOCATION_SYSTEMS: ReadonlyMap<number, number | null> = new Map();

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
  offerIndex: ReturnType<typeof useOfferIndex>;
  /** Rows read through R2 for the search's types; `null` when none were. */
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
   * box re-runs only the cheap type narrowing rather than a fresh pass
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
   * Jump Range folded in here rather than into `nonTypeFilter`:
   * only this layer resolves an offer's system (`useOfferLocations`), so
   * `filterContractOffers` cannot see it; the query gets the resolved systems. A row this app has *placed* and
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
  const locationSystems = useMemo(
    () =>
      allowedSystems === null
        ? NO_LOCATION_SYSTEMS
        : new Map([...offerLocations].map(([id, location]) => [id, location.systemId])),
    [allowedSystems, offerLocations]
  );
  /**
   * Cheapest first, so the rows arrive in the order the table's default
   * sort shows them rather than the snapshot's own contract-then-type order.
   * An unpriced (barter) row sorts last regardless of its raw price (issue
   * #1080). Below market only reads which contracts pass; the offer table is
   * not shown, so it skips the sort.
   *
   * One query answers rows and per-type stats together, in a worker for a
   * big snapshot (issue #4128).
   */
  // Deferred so a price/region edit keeps the inputs responsive while the
  // ~370k-row filter reruns at low priority.
  const deferredNonTypeFilter = useDeferredValue(nonTypeFilter);
  const itemQuery = useMemo<ContractOfferQuery>(
    () => ({
      filter: deferredNonTypeFilter,
      typeIds,
      allowedSystems,
      locationSystems,
      sort: !belowMarket,
    }),
    [deferredNonTypeFilter, typeIds, allowedSystems, locationSystems, belowMarket]
  );
  const {
    displayRows,
    stats: queryStats,
    awaitingFirst: awaitingQuery,
  } = useContractOfferQuery(rows, itemQuery);
  const statsByType = useMemo(() => {
    // The index's own per-type count and cheapest stand in. They ignore the
    // other filters, so the types whose rows were read get their real stats.
    if (offerIndex) {
      const stats = new Map<number, ContractOfferStats>(
        [...offerIndex.types.values()].map((entry) => [
          entry.typeId,
          { offerCount: entry.count, cheapest: entry.cheapest },
        ])
      );
      if (earlyRows !== null) {
        for (const [typeId, typeStats] of queryStats) stats.set(typeId, typeStats);
      }
      return stats;
    }
    return queryStats;
  }, [offerIndex, earlyRows, queryStats]);

  return { nonTypeFilter, statsByType, displayRows, awaitingQuery };
}
