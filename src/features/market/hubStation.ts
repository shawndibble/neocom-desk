import { TRADE_HUBS } from '@/market/hubs';

const HUB_STATION_IDS = new Set(TRADE_HUBS.map((hub) => hub.stationId));

export function isOffHubStation(stationName: string | null, locationId: number): boolean {
  return stationName !== null && !HUB_STATION_IDS.has(locationId);
}
