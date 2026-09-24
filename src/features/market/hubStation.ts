import { TRADE_HUBS } from '@/market/hubs';

/** The five NPC trade hub stations — shared by `OpenOrdersPanel`'s table column and `OpenOrdersList`'s phone row, so the "off hub" call can never disagree between the two. */
const HUB_STATION_IDS = new Set(TRADE_HUBS.map((hub) => hub.stationId));

/** True for a resolved station outside the five trade hubs — an order there sees far fewer buyers. Callers only claim this once the location is actually resolved (`stationName !== null`); an unresolved player structure is "not checked", not "off hub". */
export function isOffHubStation(locationId: number): boolean {
  return !HUB_STATION_IDS.has(locationId);
}
