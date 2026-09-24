import { TRADE_HUBS } from '@/market/hubs';

/** The five NPC trade hub stations — shared by `OpenOrdersPanel`'s table column and `OpenOrdersList`'s phone row, so the "off hub" call can never disagree between the two. */
const HUB_STATION_IDS = new Set(TRADE_HUBS.map((hub) => hub.stationId));

/** True for a resolved station outside the five trade hubs — an order there sees far fewer buyers. False for an unresolved player structure (`stationName === null`): "not checked" is never "off hub". */
export function isOffHubStation(stationName: string | null, locationId: number): boolean {
  return stationName !== null && !HUB_STATION_IDS.has(locationId);
}
