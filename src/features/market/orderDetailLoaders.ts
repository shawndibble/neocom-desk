/**
 * Order Detail's loader adapter: the six fetches behind its caches, as one
 * seam. Production reads ESI, Fuzzwork and the SDE through
 * `esiOrderDetailLoaders`; a test provides an in-memory fake through
 * `OrderDetailLoadersContext` instead of mocking modules.
 */
import { createContext } from 'react';
import { loadReprocessing } from '@/sde/loadSde';
import { jumpsBetween } from '@/features/route/jumpBasis';
import {
  loadRegionCompetition,
  loadStationBestPrices,
  loadStructureCompetition,
} from './orderCompetition';
import { loadPriceHistory } from './priceHistory';

export interface OrderDetailLoaders {
  /** One item's whole region order book — the deeper check behind system and region scopes (ADR 0003). */
  regionCompetition: typeof loadRegionCompetition;
  /** One player structure's market book; resolves null when it can't be read (403, no scope, network). */
  structureCompetition: typeof loadStructureCompetition;
  /** Jumps between two systems under the pilot's jump basis (`features/route/jumpBasis.ts`). */
  jumpsBetween: typeof jumpsBetween;
  priceHistory: typeof loadPriceHistory;
  /** The SDE's baked reprocessing yields, every item. */
  reprocessing: typeof loadReprocessing;
  /** Best buy/sell at specific stations — for the refine materials and the hub bids. */
  stationBestPrices: typeof loadStationBestPrices;
}

/**
 * Each entry looks its loader up only when called, never at import: a test
 * elsewhere that mocks one of these modules without the export this reads
 * must not fail merely for importing a page that mounts Order Detail.
 */
export const esiOrderDetailLoaders: OrderDetailLoaders = {
  regionCompetition: (regionId, typeId) => loadRegionCompetition(regionId, typeId),
  structureCompetition: (characterId, structureId) =>
    loadStructureCompetition(characterId, structureId),
  jumpsBetween: (origin, destination, basis) => jumpsBetween(origin, destination, basis),
  priceHistory: (regionId, typeId) => loadPriceHistory(regionId, typeId),
  reprocessing: () => loadReprocessing(),
  stationBestPrices: (requests) => loadStationBestPrices(requests),
};

export const OrderDetailLoadersContext = createContext<OrderDetailLoaders>(esiOrderDetailLoaders);
