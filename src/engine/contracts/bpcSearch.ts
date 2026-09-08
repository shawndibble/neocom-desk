/**
 * Pure filter over the public BPC contract search's synced rows (issue #608,
 * ADR 0013). Sorting is left to `DataTable`'s own column sort — this only
 * narrows the row set, which is the part a table's `sortValue` callbacks
 * can't express.
 */

/** One synced row — a for-sale blueprint copy joined to its contract. Mirrors `functions/src/publicContracts.ts`'s `BpcContractRow`, which this module never imports (client and Functions are separate packages). */
export interface BpcContractRow {
  contractId: number;
  regionId: number;
  locationId: number;
  typeId: number;
  price: number;
  buyout?: number;
  isAuction: boolean;
  me: number;
  te: number;
  runs: number;
  quantity: number;
  /** Epoch ms. */
  dateExpired: number;
}

export interface BpcSearchFilter {
  /**
   * `null`/`undefined` means "no type search active" (every row passes). An
   * empty-but-present `Set` means a search ran and matched nothing — that
   * must filter down to zero rows, not be mistaken for "unfiltered".
   */
  typeIds?: ReadonlySet<number> | null;
  regionId?: number | null;
  minMe?: number | null;
  minTe?: number | null;
  minRuns?: number | null;
  maxPrice?: number | null;
}

export const EMPTY_BPC_SEARCH_FILTER: BpcSearchFilter = {
  typeIds: null,
  regionId: null,
  minMe: null,
  minTe: null,
  minRuns: null,
  maxPrice: null,
};

/**
 * What a maxPrice filter judges an auction row on. An auction's `price` is
 * its starting bid, not what it will actually sell for — filtering on that
 * would hide a cheap-starting auction that is about to sell for far more, or
 * pass one that never will. `buyout`, when the seller set one, is the only
 * real ceiling; with no buyout at all, the eventual price is simply unknown,
 * so the row passes rather than being disqualified on a number that says
 * nothing about it.
 */
function priceForMaxFilter(row: BpcContractRow): number | null {
  if (!row.isAuction) return row.price;
  return row.buyout ?? null;
}

export function filterBpcContracts(
  rows: readonly BpcContractRow[],
  filter: BpcSearchFilter
): BpcContractRow[] {
  return rows.filter((row) => {
    if (filter.typeIds && !filter.typeIds.has(row.typeId)) return false;
    if (filter.regionId != null && row.regionId !== filter.regionId) return false;
    if (filter.minMe != null && row.me < filter.minMe) return false;
    if (filter.minTe != null && row.te < filter.minTe) return false;
    if (filter.minRuns != null && row.runs < filter.minRuns) return false;
    if (filter.maxPrice != null) {
      const price = priceForMaxFilter(row);
      if (price != null && price > filter.maxPrice) return false;
    }
    return true;
  });
}

export interface BlueprintTypeOption {
  typeId: number;
  name: string;
}

/**
 * Distinct blueprint/formula types actually present in the loaded rows,
 * named from the SDE blueprint catalog and sorted by name — the item-type
 * search's corpus. Deliberately narrower than the whole SDE catalog: search
 * only what is actually for sale right now, so a query never returns a type
 * with zero listings, and the catalog stays small enough that
 * `rankedSearch`'s result cap is never the reason a real match goes missing.
 */
export function listedBlueprintTypeOptions(
  rows: readonly BpcContractRow[],
  blueprintNames: ReadonlyMap<number, string>
): BlueprintTypeOption[] {
  const seen = new Map<number, string>();
  for (const row of rows) {
    if (seen.has(row.typeId)) continue;
    seen.set(row.typeId, blueprintNames.get(row.typeId) ?? `#${row.typeId}`);
  }
  return [...seen.entries()]
    .map(([typeId, name]) => ({ typeId, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
