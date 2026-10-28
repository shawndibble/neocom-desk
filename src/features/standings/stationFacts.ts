import type { NpcStationEntry } from '@/sde/marketTypes';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';

export interface StationFacts {
  stations: NpcStationEntry[];
  stationCount: number;
  /** Distinct solar systems the stations sit in. */
  systemIds: number[];
  /** The Trade Hubs among them: at most one for a corporation, several for a faction. */
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

/**
 * The NPC stations a corporation owns, from the shipped snapshot
 * (`loadNpcStations`). The snapshot does not carry a station's own
 * reprocessing take, so facts hold none; callers price at
 * `DEFAULT_STATION_TAKE_PCT`.
 */
export function corporationStationFacts(
  corporationId: number,
  stations: readonly NpcStationEntry[]
): StationFacts {
  return factsOf(
    stations.filter((station) => station.ownerCorporationId === corporationId),
    (hub) => hub.ownerCorporationId === corporationId
  );
}

/** The stations of every corporation in the faction. */
export function factionStationFacts(
  factionId: number,
  stations: readonly NpcStationEntry[]
): StationFacts {
  return factsOf(
    stations.filter((station) => station.ownerFactionId === factionId),
    (hub) => hub.ownerFactionId === factionId
  );
}
