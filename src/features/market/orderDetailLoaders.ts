/**
 * Order Detail's loader adapter: the six fetches behind its caches, as one
 * seam. Production reads ESI, Fuzzwork and the SDE through
 * `esiOrderDetailLoaders`; a test provides an in-memory fake through
 * `OrderDetailLoadersContext` instead of mocking modules.
 */
import { createContext } from 'react';
import { loadReprocessing } from '@/sde/loadSde';
import {
  loadJumpsBetween,
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
  jumpsBetween: typeof loadJumpsBetween;
  priceHistory: typeof loadPriceHistory;
  /** The SDE's baked reprocessing yields, every item. */
  reprocessing: typeof loadReprocessing;
  /** Best buy/sell at specific stations — for the refine materials and the hub bids. */
  stationBestPrices: typeof loadStationBestPrices;
}

export const esiOrderDetailLoaders: OrderDetailLoaders = {
  regionCompetition: loadRegionCompetition,
  structureCompetition: loadStructureCompetition,
  jumpsBetween: loadJumpsBetween,
  priceHistory: loadPriceHistory,
  reprocessing: loadReprocessing,
  stationBestPrices: loadStationBestPrices,
};

export const OrderDetailLoadersContext = createContext<OrderDetailLoaders>(esiOrderDetailLoaders);
