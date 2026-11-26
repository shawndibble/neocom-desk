import { lookupNpcStation } from '@/sde/npcStations';
import { TRADE_HUBS } from '@/market/hubs';
import {
  resolveOwnerStandings,
  ZERO_STANDINGS,
  type CharacterStandingEntry,
  type ResolvedStandings,
} from '@/engine/market/standings';

export async function resolveLocationStandings(
  locationId: number,
  standings: readonly CharacterStandingEntry[]
): Promise<ResolvedStandings> {
  const hub = TRADE_HUBS.find((h) => h.stationId === locationId);
  if (hub) return resolveOwnerStandings(hub.ownerCorporationId, hub.ownerFactionId, standings);

  const snapshot = await lookupNpcStation(locationId);
  if (snapshot === null || snapshot === undefined) return ZERO_STANDINGS;

  if (snapshot.ownerCorporationId === undefined) return ZERO_STANDINGS;
  return resolveOwnerStandings(
    snapshot.ownerCorporationId,
    snapshot.ownerFactionId ?? null,
    standings
  );
}
