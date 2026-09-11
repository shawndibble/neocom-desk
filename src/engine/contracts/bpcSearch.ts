/**
 * Pure filter over the public BPC contract search's synced rows (issue #608,
 * ADR 0013). Sorting is left to `DataTable`'s own column sort — this only
 * narrows the row set, which is the part a table's `sortValue` callbacks
 * can't express.
 */
import type { SpaceKind } from '@/engine/space';

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
  /**
   * `null`/`undefined` means "every space passes" (the filter's own default:
   * all four checked). A row whose space could not be classified (contract
   * row at a player structure, or an owned row whose location has not
   * resolved yet) is excluded once a real restriction is active — the same
   * stance `regionId` already takes on a row with no known region.
   */
  spaceKinds?: ReadonlySet<SpaceKind> | null;
}

export const EMPTY_BPC_SEARCH_FILTER: BpcSearchFilter = {
  typeIds: null,
  regionId: null,
  minMe: null,
  minTe: null,
  minRuns: null,
  maxPrice: null,
  spaceKinds: null,
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

export type BpcSearchSource = 'contract' | 'owned';

/** The fields `filterBpcSearchRows`/`ownedBlueprintToSearchRow` need out of a character's owned blueprint (ESI's `CharacterBlueprint`) — kept local to this module rather than importing the ESI type, so `src/engine` stays decoupled from `src/esi`. */
export interface OwnedBlueprintInput {
  itemId: number;
  typeId: number;
  /** -1 for an original (BPO) — offers unlimited runs, not "fewer" than any copy. */
  runs: number;
  me: number;
  te: number;
  quantity: number;
  /** The resolved station/structure/system name, or `null` while unresolved (offline, or the character has no ACL into a structure). */
  locationName?: string | null;
  /** The region the resolved location sits in, or `null` while unresolved. */
  regionId?: number | null;
  /** The resolved location's four-way space classification, or `null` while unresolved. */
  space?: SpaceKind | null;
}

/**
 * One row in BPC Search's unified results. Common fields sit at the top level
 * so a column can read `row.me`/`row.te` without narrowing; a contract row
 * also carries the original `BpcContractRow` for contract-only UI (the detail
 * modal, the build-plan seed) to use without re-deriving it.
 *
 * `locationName`/`space` sit at the top level on both branches (rather than
 * nested under `contract`) so the Location/Space columns and the Space filter
 * read one field regardless of source — a contract row's `regionId` for
 * filtering purposes lives at `contract.regionId` still (it was always known,
 * synced with every row), but `locationName`/`space` need per-row resolution
 * work neither branch had before this ticket, so both start `null` until a
 * caller resolves them.
 */
export type BpcSearchRow =
  | {
      source: 'contract';
      typeId: number;
      me: number;
      te: number;
      runs: number;
      quantity: number;
      contract: BpcContractRow;
      locationName: string | null;
      space: SpaceKind | null;
    }
  | {
      source: 'owned';
      typeId: number;
      me: number;
      te: number;
      runs: number;
      quantity: number;
      itemId: number;
      locationName: string | null;
      regionId: number | null;
      space: SpaceKind | null;
    };

/**
 * `location` is optional: most callers resolve it separately (an ESI/SDE
 * lookup keyed on `contract.locationId`, run outside this pure module) and
 * pass the result in once it's ready, rather than this function blocking on
 * it — a table needs to show contract rows immediately and fill in
 * Location/Space as each resolves.
 */
export function contractRowToSearchRow(
  row: BpcContractRow,
  location?: { name: string | null; space: SpaceKind | null }
): BpcSearchRow {
  return {
    source: 'contract',
    typeId: row.typeId,
    me: row.me,
    te: row.te,
    runs: row.runs,
    quantity: row.quantity,
    contract: row,
    locationName: location?.name ?? null,
    space: location?.space ?? null,
  };
}

/** The contract row behind a search row, or `null` for an owned one — the single narrowing every contract-only column/action shares instead of re-checking `row.source` itself. */
export function asContract(row: BpcSearchRow): BpcContractRow | null {
  return row.source === 'contract' ? row.contract : null;
}

export function ownedBlueprintToSearchRow(bp: OwnedBlueprintInput): BpcSearchRow {
  return {
    source: 'owned',
    typeId: bp.typeId,
    me: bp.me,
    te: bp.te,
    runs: bp.runs,
    // ESI's quantity is a real count only when positive — a single original
    // is -1, a single copy is -2 (unlike `runs`'s -1, this sentinel means
    // nothing beyond "one") — normalized here, not left for every reader.
    quantity: bp.quantity > 0 ? bp.quantity : 1,
    itemId: bp.itemId,
    locationName: bp.locationName ?? null,
    regionId: bp.regionId ?? null,
    space: bp.space ?? null,
  };
}

/**
 * Filters unified rows — a sibling of `filterBpcContracts`, kept separate so
 * the original contract-only filter path stays untouched. Price never
 * excludes an owned row (not for sale, so nothing can disqualify it) — the
 * same stance `filterBpcContracts` already takes for a no-buyout auction's
 * unknown eventual price. Region and Space *do* now exclude an owned row once
 * a restriction is active and the row's location has not resolved to a
 * matching value — resolving that location is issue #796's whole point, but
 * an unresolved one (offline, no ACL) still cannot honestly match a specific
 * region or space the player picked.
 */
export function filterBpcSearchRows(
  rows: readonly BpcSearchRow[],
  filter: BpcSearchFilter
): BpcSearchRow[] {
  return rows.filter((row) => {
    if (filter.typeIds && !filter.typeIds.has(row.typeId)) return false;
    if (filter.minMe != null && row.me < filter.minMe) return false;
    if (filter.minTe != null && row.te < filter.minTe) return false;
    if (filter.minRuns != null && row.runs !== -1 && row.runs < filter.minRuns) return false;
    if (filter.regionId != null) {
      const regionId = row.source === 'contract' ? row.contract.regionId : row.regionId;
      if (regionId !== filter.regionId) return false;
    }
    if (filter.spaceKinds && (row.space == null || !filter.spaceKinds.has(row.space))) {
      return false;
    }
    if (row.source === 'contract' && filter.maxPrice != null) {
      const price = priceForMaxFilter(row.contract);
      if (price != null && price > filter.maxPrice) return false;
    }
    return true;
  });
}

/**
 * Silently ignores `filter.spaceKinds`: a raw `BpcContractRow` carries no
 * `space` of its own (that classification is resolved separately, keyed by
 * `locationId`, since ADR 0013 already deferred exact location resolution for
 * these rows) and this function stays untouched for that reason. Applying a
 * Space filter to contract rows is `BpcSourcingPanel`'s job, narrowing
 * *before* calling this — a caller that expects `spaceKinds` honored here
 * instead should use `filterBpcSearchRows`, which works over the unified row
 * shape that does carry `space`.
 */
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

/**
 * What a row costs a buyer, and the one expression every price readout on the
 * page agrees on — `DataTable`'s price column already sorts on `buyout ??
 * price`, so a "cheapest" chip computed any other way would name a number the
 * first row beneath it contradicts.
 *
 * Deliberately not `priceForMaxFilter` above, which answers a different
 * question. That one asks "could this row exceed the ceiling I set", where a
 * no-buyout auction's eventual price is unknowable and must not disqualify
 * the row; this one asks "what number do I show", where the starting bid is
 * the only figure there is. Same two fields, opposite treatment of the same
 * gap — which is why they stay separate functions rather than one with a flag.
 */
export function effectivePrice(row: BpcContractRow): number {
  if (!row.isAuction) return row.price;
  return row.buyout ?? row.price;
}

export interface BlueprintTypeOption {
  typeId: number;
  name: string;
}

/**
 * What a blueprint's listings look like in aggregate, for the search's
 * suggestion rows. An **offer** is one contract row, which is not the same as
 * one copy: a single contract can put `quantity: 3` copies up at one price.
 * Counting rows is what the buyer is choosing between, so that is what this
 * counts — and every surface says "offers", never "copies".
 */
export interface BlueprintOfferStats {
  offerCount: number;
  /** Highest ME on offer. Taken independently of `bestTe` — the two can come from different contracts, and a buyer filtering on one does not thereby get the other. */
  bestMe: number;
  bestTe: number;
}

/**
 * One pass over the rows, keyed by type. The search's suggestion list needs a
 * count and a best-ME/TE per candidate blueprint on every keystroke; deriving
 * those by re-filtering ~120,000 rows per suggestion is the shape that turns a
 * typeahead into a stutter, so the whole index is built once and looked up.
 *
 * Deliberately takes a row set rather than reaching for the whole snapshot:
 * the caller passes rows already narrowed by the *other* filters, so a
 * suggestion reading "40 offers" cannot be followed by a summary reading "2".
 */
export function blueprintOfferStats(
  rows: readonly BpcContractRow[]
): Map<number, BlueprintOfferStats> {
  const stats = new Map<number, BlueprintOfferStats>();
  for (const row of rows) {
    const existing = stats.get(row.typeId);
    if (!existing) {
      stats.set(row.typeId, { offerCount: 1, bestMe: row.me, bestTe: row.te });
      continue;
    }
    existing.offerCount += 1;
    if (row.me > existing.bestMe) existing.bestMe = row.me;
    if (row.te > existing.bestTe) existing.bestTe = row.te;
  }
  return stats;
}

/** The headline numbers for one blueprint's listings, shown once the search narrows to a single type. */
export interface BpcPriceSummary {
  offerCount: number;
  /** `null` for no offers — distinct from `0`, which would read as a free blueprint. */
  cheapest: number | null;
  median: number | null;
  bestMe: number | null;
  bestTe: number | null;
}

/**
 * Median rather than mean: a handful of 50-run copies among single-run ones
 * drags an average somewhere no actual contract sits, which is exactly the
 * number a buyer would misread as "the going rate".
 */
export function bpcPriceSummary(rows: readonly BpcContractRow[]): BpcPriceSummary {
  if (rows.length === 0) {
    return { offerCount: 0, cheapest: null, median: null, bestMe: null, bestTe: null };
  }
  const prices = rows.map(effectivePrice).sort((a, b) => a - b);
  const middle = prices.length >> 1;
  const median =
    prices.length % 2 === 1 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
  return {
    offerCount: rows.length,
    cheapest: prices[0],
    median,
    bestMe: rows.reduce((best, row) => Math.max(best, row.me), rows[0].me),
    bestTe: rows.reduce((best, row) => Math.max(best, row.te), rows[0].te),
  };
}

/** One region's cheapest listing of whatever row set it was computed over. */
export interface RegionCheapest {
  regionId: number;
  cheapest: number;
  offerCount: number;
}

/**
 * Cheapest-first, one entry per region. This is the comparison the flat table
 * cannot make: a blueprint's listings are scattered across dozens of regions,
 * and the question a buyer actually has — where is this cheapest — is
 * otherwise answered only by sorting by price and reading the region column of
 * whichever row happens to be top.
 */
export function cheapestByRegion(rows: readonly BpcContractRow[]): RegionCheapest[] {
  const byRegion = new Map<number, RegionCheapest>();
  for (const row of rows) {
    const price = effectivePrice(row);
    const existing = byRegion.get(row.regionId);
    if (!existing) {
      byRegion.set(row.regionId, { regionId: row.regionId, cheapest: price, offerCount: 1 });
      continue;
    }
    existing.offerCount += 1;
    if (price < existing.cheapest) existing.cheapest = price;
  }
  // Ties broken by region id so the order is stable across syncs rather than
  // depending on which contract the CSV happened to list first.
  return [...byRegion.values()].sort((a, b) => a.cheapest - b.cheapest || a.regionId - b.regionId);
}

/**
 * The part of a blueprint's name worth matching a query against.
 *
 * Every entry in the catalogue ends in "Blueprint", so a plain substring
 * search over the full name makes any query that is itself a substring of
 * that one shared word — "b", "lu", "print" — match all ~2,900 types at once.
 * Ranking cannot rescue that: the matches are real, they are just
 * meaningless. Dropping the shared suffix before matching is what makes
 * "buzz" reach Buzzard instead of the first fifty types alphabetically.
 *
 * Only dropped when something survives it: a type genuinely called
 * "Blueprint" must stay matchable rather than become unreachable.
 */
export function blueprintSearchName(name: string): string {
  const stripped = name.replace(/\s+blueprint\s*$/i, '').trim();
  return stripped.length > 0 ? stripped : name.trim();
}

/**
 * Distinct blueprint/formula types actually present in the loaded rows,
 * named from the SDE blueprint catalog and sorted by name — the item-type
 * search's corpus. Deliberately narrower than the whole SDE catalog: search
 * only what is actually searchable right now (for sale, or owned), so a
 * query never returns a type with zero results, and the catalog stays small
 * enough that `rankedSearch`'s result cap is never the reason a real match
 * goes missing. Takes any typeId-bearing rows rather than `BpcContractRow[]`
 * specifically, so a caller can merge contract rows and owned blueprints
 * into one corpus before calling this.
 */
export function listedBlueprintTypeOptions(
  rows: readonly { typeId: number }[],
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
