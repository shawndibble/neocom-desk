import type { NpcStationEntry } from '@/sde/marketTypes';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';

export interface StationFacts {
  stations: NpcStationEntry[];
  stationCount: number;
  systemIds: number[];
  tradeHubs: TradeHub[];
}

function factsOf(stations: NpcStationEntry[], hubs: (hub: TradeHub) => boolean): StationFacts {
  return {
    stations,
    stationCount: stations.length,
    systemIds: [...new Set(stations.map((station) => station.systemId))],
    tradeHubs: TRADE_HUBS.filter(hubs),
  };
}

export function corporationStationFacts(
  corporationId: number,
  stations: readonly NpcStationEntry[]
): StationFacts {
  return factsOf(
    stations.filter((station) => station.ownerCorporationId === corporationId),
    (hub) => hub.ownerCorporationId === corporationId
  );
}

export function factionStationFacts(
  factionId: number,
  stations: readonly NpcStationEntry[]
): StationFacts {
  return factsOf(
    stations.filter((station) => station.ownerFactionId === factionId),
    (hub) => hub.ownerFactionId === factionId
  );
}
