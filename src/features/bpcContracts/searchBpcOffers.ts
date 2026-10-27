/**
 * BPC Sourcing's search as pure functions, in two stages so a keystroke reruns only the second:
 * `prepareBpcOffers` (narrowing, type options, offer stats) and `rankBpcOffers` (type query,
 * suggestions, per-source rows, source order). `searchBpcOffers` composes both (ADR 0013, 0018).
 */
import {
  EMPTY_BPC_SEARCH_FILTER,
  blueprintOfferStats,
  blueprintSearchName,
  bpcPriceSummary,
  contractRowToSearchRow,
  filterBpcContracts,
  filterBpcSearchRows,
  listedBlueprintTypeOptions,
  marketBpoToSearchRow,
  ownedBlueprintToSearchRow,
  type BlueprintOfferStats,
  type BlueprintTypeOption,
  type BpcContractRow,
  type BpcPriceSummary,
  type BpcSearchFilter,
  type BpcSearchRow,
} from '@/engine/contracts/bpcSearch';
import { withinJumpRange } from '@/engine/route/jumpRange';
import type { SpaceKind } from '@/engine/space';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { rankedSearch } from '@/lib/rankedSearch';
import { parseIskAmount } from '@/lib/isk';
import type { ContractLocationInfo, ResolvedLocation } from './blueprintLocation';
import type { BpcSourcingFilter } from './bpcActiveFilters';
import type { SourceToggle } from './bpcSourcingUrl';
import {
  cheaperBpo,
  cheapestBpoSourcesByType,
  MARKET_BPO_LOOKUP_LIMIT,
  marketBpoOffers,
  type BpoOffer,
  type BpoSources,
  type MarketBpoBook,
} from './bpoAvailability';

/** Rows of the typed-search type filter: the closest this many blueprint names. */
const TYPE_SEARCH_LIMIT = 50;

/** Blueprints offered in the autocomplete under the search box. */
const SUGGESTION_LIMIT = 8;

/** One row of the search's autocomplete: a candidate blueprint plus what its listings look like. */
export type BlueprintSuggestion = BlueprintTypeOption & BlueprintOfferStats;

/** What the sources loaded; nothing here depends on the query. */
export interface BpcSourceData {
  /** Public contract copies. */
  contractRows: readonly BpcContractRow[];
  /** Public contract originals. */
  originals: readonly BpcContractRow[];
  /** Keyed by `BpcContractRow.locationId`. */
  contractLocations: ReadonlyMap<number, ContractLocationInfo>;
  blueprintNames: ReadonlyMap<number, string>;
  ownedBlueprints: readonly CharacterBlueprint[];
  ownedLocations: ReadonlyMap<number, ResolvedLocation>;
  /** Market BPO books loaded for `marketTypeIds`; `marketLocations` keyed by order location. */
  marketBooksByType: ReadonlyMap<number, MarketBpoBook>;
  marketLocations: ReadonlyMap<number, ContractLocationInfo>;
  /** Null until the market region is known: no market rows. */
  marketRegionId: number | null;
  marketHubStationId: number;
  /** The types the market was looked up for (`bpcMarketLookup`). */
  marketTypeIds: readonly number[];
  /** Already built from every blueprint; narrowed here to the searched types. */
  lpRows: readonly BpcSearchRow[];
  communityRows: readonly BpcSearchRow[];
}

/** What the pilot asked: the URL filter, the picked blueprint, the sources and the Space / Jump narrowing. */
export interface BpcQuery {
  filter: BpcSourcingFilter;
  /** The one blueprint picked from the autocomplete, or null while free text. */
  selectedTypeId: number | null;
  sources: ReadonlySet<SourceToggle>;
}

/** `BpcQuery` plus the Space / Jump narrowing that only stage 1 reads. */
export type BpcFullQuery = BpcQuery & Pick<BpcPrepareInput, 'spaceKinds' | 'allowedSystems'>;

export interface BpcOfferSearch {
  suggestions: BlueprintSuggestion[];
  /** Contract copies matching every filter (not the source toggles). */
  filteredRows: BpcContractRow[];
  bpoSourcesByType: Map<number, BpoSources>;
  bpoByType: Map<number, BpoOffer>;
  /** Every toggled-on source, merged in the table's secondary-sort order (owned, Community, LP store, then market and contracts). */
  displayRows: BpcSearchRow[];
  /** Of `filteredRows`, for the picked blueprint; null while none is picked. */
  summary: BpcPriceSummary | null;
}

/** Positive-integer text field to a filter number, or null when blank/invalid — never NaN reaching the engine filter. */
function parsePositiveNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Space and Jump Range narrow contract rows up front: `BpcContractRow` carries no space of its own. */
function narrowByLocation(
  rows: readonly BpcContractRow[],
  kinds: ReadonlySet<SpaceKind> | null,
  allowedSystems: ReadonlySet<number> | null,
  locations: ReadonlyMap<number, ContractLocationInfo>
): readonly BpcContractRow[] {
  if (!kinds && !allowedSystems) return rows;
  return rows.filter((row) => {
    const location = locations.get(row.locationId);
    if (kinds && (location?.space == null || !kinds.has(location.space))) return false;
    return withinJumpRange(location?.systemId, allowedSystems);
  });
}

/**
 * The blueprint types the market is checked for BPOs: the
 * chosen blueprint, else the closest typed matches across the whole SDE,
 * else none — never every type in the results. `capped` when more matched.
 */
export function bpcMarketLookup(
  selectedTypeId: number | null,
  typeQuery: string,
  allBlueprintOptions: readonly BlueprintTypeOption[]
): { typeIds: number[]; capped: boolean } {
  if (selectedTypeId !== null) return { typeIds: [selectedTypeId], capped: false };
  if (typeQuery.trim() === '') return { typeIds: [], capped: false };
  const matches = rankedSearch(allBlueprintOptions, blueprintSearchName(typeQuery), {
    primary: (o) => blueprintSearchName(o.name),
    limit: MARKET_BPO_LOOKUP_LIMIT + 1,
  }).map((o) => o.typeId);
  return {
    typeIds: matches.slice(0, MARKET_BPO_LOOKUP_LIMIT),
    capped: matches.length > MARKET_BPO_LOOKUP_LIMIT,
  };
}

/** The slice of `BpcSourceData` stage 1 reads; none of it moves while the type query is typed. */
export type BpcPrepareData = Pick<
  BpcSourceData,
  | 'contractRows'
  | 'originals'
  | 'contractLocations'
  | 'blueprintNames'
  | 'ownedBlueprints'
  | 'communityRows'
>;

/** What stage 1 reads of the query: everything except the type query and the picked blueprint. */
export interface BpcPrepareInput {
  filter: Omit<BpcSourcingFilter, 'typeQuery'>;
  sources: ReadonlySet<SourceToggle>;
  /** Null when every kind is checked. */
  spaceKinds: ReadonlySet<SpaceKind> | null;
  /** Null when no Jump Range is active. */
  allowedSystems: ReadonlySet<number> | null;
}

/** Stage 1 output: independent of the type query. */
export interface PreparedBpcOffers {
  spaceFilteredRows: readonly BpcContractRow[];
  spaceFilteredOriginals: readonly BpcContractRow[];
  typeOptions: BlueprintTypeOption[];
  /** Every filter except the blueprint itself: suggestion counts and the table answer the same question. */
  nonTypeFilter: BpcSearchFilter;
  /** Offer stats of `spaceFilteredRows` under `nonTypeFilter`, for the suggestions. */
  offerStats: ReadonlyMap<number, BlueprintOfferStats>;
}

/** Stage 1: Space / Jump narrowing, the searchable type options and offer stats. */
export function prepareBpcOffers(data: BpcPrepareData, input: BpcPrepareInput): PreparedBpcOffers {
  const { filter: uiFilter, sources, spaceKinds, allowedSystems } = input;
  const { contractLocations } = data;
  const spaceFilteredRows = narrowByLocation(
    data.contractRows,
    spaceKinds,
    allowedSystems,
    contractLocations
  );
  const spaceFilteredOriginals = narrowByLocation(
    data.originals,
    spaceKinds,
    allowedSystems,
    contractLocations
  );

  // Owned and Community typeIds join the options (gated on their toggles) so
  // free-text search finds a blueprint only they hold, never displacing a real
  // contract match from the ranked window when the source is off.
  const ownedTypeIds = sources.has('owned')
    ? data.ownedBlueprints.map((bp) => ({ typeId: bp.type_id }))
    : [];
  const communityTypeIds = sources.has('community')
    ? data.communityRows.map((row) => ({ typeId: row.typeId }))
    : [];
  const listedOriginals = sources.has('contractBpo') ? spaceFilteredOriginals : [];
  const typeOptions = listedBlueprintTypeOptions(
    [...spaceFilteredRows, ...listedOriginals, ...ownedTypeIds, ...communityTypeIds],
    data.blueprintNames
  );

  const nonTypeFilter: BpcSearchFilter = {
    ...EMPTY_BPC_SEARCH_FILTER,
    regionId: uiFilter.regionId,
    minMe: parsePositiveNumber(uiFilter.minMe),
    minTe: parsePositiveNumber(uiFilter.minTe),
    minRuns: parsePositiveNumber(uiFilter.minRuns),
    maxPrice: uiFilter.maxPrice.trim() === '' ? null : parseIskAmount(uiFilter.maxPrice),
    spaceKinds,
    allowedSystems,
    hideAuctions: uiFilter.hideAuctions,
    hidePlexRequests: uiFilter.hidePlex,
  };
  const offerStats = blueprintOfferStats(filterBpcContracts(spaceFilteredRows, nonTypeFilter));
  return { spaceFilteredRows, spaceFilteredOriginals, typeOptions, nonTypeFilter, offerStats };
}

/**
 * Stage 2's answer before the contract rows become search rows: the contract copies and originals
 * that pass stay `BpcContractRow`s (so a worker can send indices instead), the rest is final.
 */
export interface BpcRankParts {
  suggestions: BlueprintSuggestion[];
  /** Contract copies matching every filter (not the source toggles). */
  filteredRows: BpcContractRow[];
  /** Contract originals matching every filter. */
  filteredOriginals: BpcContractRow[];
  ownedRows: BpcSearchRow[];
  communityRows: BpcSearchRow[];
  lpRows: BpcSearchRow[];
  marketRows: BpcSearchRow[];
  bpoSourcesByType: Map<number, BpoSources>;
  bpoByType: Map<number, BpoOffer>;
  summary: BpcPriceSummary | null;
}

/** Stage 2's heavy half: the type query's suggestions and every source's filtered rows. */
export function rankBpcParts(
  prepared: PreparedBpcOffers,
  data: BpcSourceData,
  query: BpcQuery
): BpcRankParts {
  const { filter: uiFilter, selectedTypeId, sources } = query;
  const { spaceFilteredRows, spaceFilteredOriginals, typeOptions, nonTypeFilter, offerStats } =
    prepared;
  const hasTypeQuery = uiFilter.typeQuery.trim() !== '';
  const typeMatches = (limit: number) =>
    rankedSearch(typeOptions, blueprintSearchName(uiFilter.typeQuery), {
      primary: (option) => blueprintSearchName(option.name),
      limit,
    });

  let typeIds: Set<number> | null = null;
  if (selectedTypeId !== null) typeIds = new Set([selectedTypeId]);
  else if (hasTypeQuery) typeIds = new Set(typeMatches(TYPE_SEARCH_LIMIT).map((o) => o.typeId));
  const engineFilter: BpcSearchFilter = { ...nonTypeFilter, typeIds };

  const filteredRows = filterBpcContracts(spaceFilteredRows, engineFilter);

  const ownedSearchRows = data.ownedBlueprints.map((bp) => {
    const location = data.ownedLocations.get(bp.location_id);
    return ownedBlueprintToSearchRow({
      itemId: bp.item_id,
      typeId: bp.type_id,
      runs: bp.runs,
      me: bp.material_efficiency,
      te: bp.time_efficiency,
      quantity: bp.quantity,
      locationName: location?.name ?? null,
      regionId: location?.regionId ?? null,
      space: location?.space ?? null,
      systemId: location?.systemId ?? null,
    });
  });
  const filteredOwnedRows = filterBpcSearchRows(ownedSearchRows, engineFilter);

  const filteredOriginals = filterBpcContracts(spaceFilteredOriginals, engineFilter);

  // Already limited to the looked-up types, so filtered on everything but the
  // listed-type search (`engineFilter.typeIds` only knows listed types).
  const marketSearchRows: BpcSearchRow[] = [];
  if (data.marketRegionId !== null) {
    for (const [typeId, book] of data.marketBooksByType) {
      for (const offer of marketBpoOffers(book.sell, book.regionId, data.marketHubStationId)) {
        const location = data.marketLocations.get(offer.locationId);
        marketSearchRows.push(
          marketBpoToSearchRow({
            orderId: offer.orderId,
            typeId,
            regionId: offer.regionId,
            locationId: offer.locationId,
            price: offer.price,
            volumeRemain: offer.volumeRemain,
            atHub: offer.atHub,
            locationName: location?.name ?? null,
            space: location?.space ?? null,
            systemId: location?.systemId ?? null,
          })
        );
      }
    }
  }
  const filteredMarketRows = filterBpcSearchRows(marketSearchRows, nonTypeFilter);

  // LP and Community rows cover every blueprint; a typed or picked search
  // narrows them to the looked-up types.
  const searchedTypeIds =
    selectedTypeId !== null || hasTypeQuery
      ? new Set([...data.marketTypeIds, ...(typeIds ?? [])])
      : null;
  const narrowLpAndCommunity = (rows: readonly BpcSearchRow[]) =>
    filterBpcSearchRows(
      searchedTypeIds ? rows.filter((row) => searchedTypeIds.has(row.typeId)) : rows,
      nonTypeFilter
    );
  const lpSearchRows = narrowLpAndCommunity(data.lpRows);
  const communitySearchRows = narrowLpAndCommunity(data.communityRows);

  // Offers a blueprint has beyond the contract snapshot: an owned or community
  // blueprint is a pickable result too, even when nobody has contracted it.
  const suggestionStats = new Map(offerStats);
  const extraRows = [
    ...(sources.has('owned') ? filteredOwnedRows : []),
    ...(sources.has('community') ? communitySearchRows : []),
  ];
  for (const row of extraRows) {
    const existing = suggestionStats.get(row.typeId);
    suggestionStats.set(row.typeId, {
      offerCount: (existing?.offerCount ?? 0) + 1,
      bestMe: Math.max(existing?.bestMe ?? 0, row.me),
      bestTe: Math.max(existing?.bestTe ?? 0, row.te),
    });
  }
  const suggestions: BlueprintSuggestion[] = [];
  if (selectedTypeId === null && hasTypeQuery) {
    for (const option of typeMatches(SUGGESTION_LIMIT)) {
      // A blueprint with no offers left under the current filters is not a
      // candidate — picking it would resolve to an empty table.
      const stats = suggestionStats.get(option.typeId);
      if (stats) suggestions.push({ ...option, ...stats });
    }
  }

  // The cheapest BPO per blueprint type in the results: contract originals in
  // the Region filter's scope, market orders for the looked-up types only.
  const bpoTypeIds = new Set(data.marketTypeIds);
  for (const row of filteredRows) bpoTypeIds.add(row.typeId);
  for (const row of filteredOwnedRows) bpoTypeIds.add(row.typeId);
  const bpoSourcesByType = cheapestBpoSourcesByType(bpoTypeIds, {
    originals: data.originals,
    contractRegionId: uiFilter.regionId,
    marketBooks: data.marketBooksByType,
    hubStationId: data.marketHubStationId,
  });
  const bpoByType = new Map<number, BpoOffer>();
  for (const [typeId, bpoSources] of bpoSourcesByType) {
    const best = cheaperBpo(bpoSources);
    if (best) bpoByType.set(typeId, best);
  }

  return {
    suggestions,
    filteredRows,
    filteredOriginals,
    ownedRows: filteredOwnedRows,
    communityRows: communitySearchRows,
    lpRows: lpSearchRows,
    marketRows: filteredMarketRows,
    bpoSourcesByType,
    bpoByType,
    summary: selectedTypeId === null ? null : bpcPriceSummary(filteredRows),
  };
}

/** Stage 2's light half: contract rows to search rows, then the source-ordered merge. */
export function assembleBpcOffers(
  parts: BpcRankParts,
  data: Pick<BpcSourceData, 'contractLocations'>,
  sources: ReadonlySet<SourceToggle>
): BpcOfferSearch {
  const toSearchRows = (rows: readonly BpcContractRow[]) =>
    rows.map((row) => contractRowToSearchRow(row, data.contractLocations.get(row.locationId)));
  // The order here is the table's hidden secondary sort. The panel's sort
  // (and `DataTable`'s own) is stable, so whichever column the pilot sorts by,
  // rows that tie on it fall back to this order: owned, then Community, then
  // LP store, then market and contracts (the synced snapshot can run to six
  // figures while the others number in the dozens).
  const displayRows: BpcSearchRow[] = [
    ...(sources.has('owned') ? parts.ownedRows : []),
    ...(sources.has('community') ? parts.communityRows : []),
    ...(sources.has('lp') ? parts.lpRows : []),
    ...(sources.has('market') ? parts.marketRows : []),
    ...(sources.has('contractBpo') ? toSearchRows(parts.filteredOriginals) : []),
    ...(sources.has('contract') ? toSearchRows(parts.filteredRows) : []),
  ];
  return {
    suggestions: parts.suggestions,
    filteredRows: parts.filteredRows,
    bpoSourcesByType: parts.bpoSourcesByType,
    bpoByType: parts.bpoByType,
    displayRows,
    summary: parts.summary,
  };
}

/** Stage 2: the type query's suggestions, per-source rows and the source-ordered merge. */
export function rankBpcOffers(
  prepared: PreparedBpcOffers,
  data: BpcSourceData,
  query: BpcQuery
): BpcOfferSearch {
  return assembleBpcOffers(rankBpcParts(prepared, data, query), data, query.sources);
}

/** `BpcRankParts` with the two contract lists as indices into `BpcSourceData.contractRows` / `originals`. */
export type BpcRankReplyParts = Omit<BpcRankParts, 'filteredRows' | 'filteredOriginals'> & {
  filteredIndices: Uint32Array;
  originalIndices: Uint32Array;
};

/** Where each contract row sits in its source array, built once per snapshot. */
export interface BpcRowIndex {
  contracts: ReadonlyMap<BpcContractRow, number>;
  originals: ReadonlyMap<BpcContractRow, number>;
}

export function indexBpcRows(data: Pick<BpcSourceData, 'contractRows' | 'originals'>): BpcRowIndex {
  const index = (rows: readonly BpcContractRow[]) => new Map(rows.map((row, i) => [row, i]));
  return { contracts: index(data.contractRows), originals: index(data.originals) };
}

function toIndices(rows: readonly BpcContractRow[], at: ReadonlyMap<BpcContractRow, number>) {
  const out = new Uint32Array(rows.length);
  rows.forEach((row, i) => {
    const position = at.get(row);
    if (position === undefined) throw new Error('row not in snapshot');
    out[i] = position;
  });
  return out;
}

/** The worker's side: row lists become index arrays, cheap to send. */
export function compactBpcRankParts(parts: BpcRankParts, index: BpcRowIndex): BpcRankReplyParts {
  const { filteredRows, filteredOriginals, ...rest } = parts;
  return {
    ...rest,
    filteredIndices: toIndices(filteredRows, index.contracts),
    originalIndices: toIndices(filteredOriginals, index.originals),
  };
}

/** The page's side: indices back to the rows it already holds. */
export function expandBpcRankParts(
  reply: BpcRankReplyParts,
  data: Pick<BpcSourceData, 'contractRows' | 'originals'>
): BpcRankParts {
  const { filteredIndices, originalIndices, ...rest } = reply;
  return {
    ...rest,
    filteredRows: Array.from(filteredIndices, (i) => data.contractRows[i]),
    filteredOriginals: Array.from(originalIndices, (i) => data.originals[i]),
  };
}

/** Both stages composed; the panel memoises them separately. */
export function searchBpcOffers(data: BpcSourceData, query: BpcFullQuery): BpcOfferSearch {
  return rankBpcOffers(prepareBpcOffers(data, query), data, query);
}
