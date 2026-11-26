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
  regionCompetition: typeof loadRegionCompetition;
  structureCompetition: typeof loadStructureCompetition;
  jumpsBetween: typeof jumpsBetween;
  priceHistory: typeof loadPriceHistory;
  reprocessing: typeof loadReprocessing;
  stationBestPrices: typeof loadStationBestPrices;
}

const esiOrderDetailLoaders: OrderDetailLoaders = {
  regionCompetition: (regionId, typeId) => loadRegionCompetition(regionId, typeId),
  structureCompetition: (characterId, structureId) =>
    loadStructureCompetition(characterId, structureId),
  jumpsBetween: (origin, destination, basis) => jumpsBetween(origin, destination, basis),
  priceHistory: (regionId, typeId) => loadPriceHistory(regionId, typeId),
  reprocessing: () => loadReprocessing(),
  stationBestPrices: (requests) => loadStationBestPrices(requests),
};

export const OrderDetailLoadersContext = createContext<OrderDetailLoaders>(esiOrderDetailLoaders);
