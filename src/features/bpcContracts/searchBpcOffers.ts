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

const TYPE_SEARCH_LIMIT = 50;

const SUGGESTION_LIMIT = 8;

export type BlueprintSuggestion = BlueprintTypeOption & BlueprintOfferStats;

export interface BpcSourceData {
  contractRows: readonly BpcContractRow[];
  originals: readonly BpcContractRow[];
  contractLocations: ReadonlyMap<number, ContractLocationInfo>;
  blueprintNames: ReadonlyMap<number, string>;
  ownedBlueprints: readonly CharacterBlueprint[];
  ownedLocations: ReadonlyMap<number, ResolvedLocation>;
  marketBooksByType: ReadonlyMap<number, MarketBpoBook>;
  marketLocations: ReadonlyMap<number, ContractLocationInfo>;
  marketRegionId: number | null;
  marketHubStationId: number;
  marketTypeIds: readonly number[];
  lpRows: readonly BpcSearchRow[];
  communityRows: readonly BpcSearchRow[];
}

export interface BpcQuery {
  filter: BpcSourcingFilter;
  selectedTypeId: number | null;
  sources: ReadonlySet<SourceToggle>;
}

export type BpcFullQuery = BpcQuery & Pick<BpcPrepareInput, 'spaceKinds' | 'allowedSystems'>;

export interface BpcOfferSearch {
  suggestions: BlueprintSuggestion[];
  filteredRows: BpcContractRow[];
  bpoSourcesByType: Map<number, BpoSources>;
  bpoByType: Map<number, BpoOffer>;
  displayRows: BpcSearchRow[];
  summary: BpcPriceSummary | null;
}

function parsePositiveNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

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

export type BpcPrepareData = Pick<
  BpcSourceData,
  | 'contractRows'
  | 'originals'
  | 'contractLocations'
  | 'blueprintNames'
  | 'ownedBlueprints'
  | 'communityRows'
>;

export interface BpcPrepareInput {
  filter: Omit<BpcSourcingFilter, 'typeQuery'>;
  sources: ReadonlySet<SourceToggle>;
  spaceKinds: ReadonlySet<SpaceKind> | null;
  allowedSystems: ReadonlySet<number> | null;
}

export interface PreparedBpcOffers {
  spaceFilteredRows: readonly BpcContractRow[];
  spaceFilteredOriginals: readonly BpcContractRow[];
  typeOptions: BlueprintTypeOption[];
  nonTypeFilter: BpcSearchFilter;
  offerStats: ReadonlyMap<number, BlueprintOfferStats>;
}

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

export interface BpcRankParts {
  suggestions: BlueprintSuggestion[];
  filteredRows: BpcContractRow[];
  filteredOriginals: BpcContractRow[];
  ownedRows: BpcSearchRow[];
  communityRows: BpcSearchRow[];
  lpRows: BpcSearchRow[];
  marketRows: BpcSearchRow[];
  bpoSourcesByType: Map<number, BpoSources>;
  bpoByType: Map<number, BpoOffer>;
  summary: BpcPriceSummary | null;
}

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
      const stats = suggestionStats.get(option.typeId);
      if (stats) suggestions.push({ ...option, ...stats });
    }
  }

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

export function assembleBpcOffers(
  parts: BpcRankParts,
  data: Pick<BpcSourceData, 'contractLocations'>,
  sources: ReadonlySet<SourceToggle>
): BpcOfferSearch {
  const toSearchRows = (rows: readonly BpcContractRow[]) =>
    rows.map((row) => contractRowToSearchRow(row, data.contractLocations.get(row.locationId)));
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

export function rankBpcOffers(
  prepared: PreparedBpcOffers,
  data: BpcSourceData,
  query: BpcQuery
): BpcOfferSearch {
  return assembleBpcOffers(rankBpcParts(prepared, data, query), data, query.sources);
}

export type BpcRankReplyParts = Omit<BpcRankParts, 'filteredRows' | 'filteredOriginals'> & {
  filteredIndices: Uint32Array;
  originalIndices: Uint32Array;
};

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

export function compactBpcRankParts(parts: BpcRankParts, index: BpcRowIndex): BpcRankReplyParts {
  const { filteredRows, filteredOriginals, ...rest } = parts;
  return {
    ...rest,
    filteredIndices: toIndices(filteredRows, index.contracts),
    originalIndices: toIndices(filteredOriginals, index.originals),
  };
}

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

export function searchBpcOffers(data: BpcSourceData, query: BpcFullQuery): BpcOfferSearch {
  return rankBpcOffers(prepareBpcOffers(data, query), data, query);
}
