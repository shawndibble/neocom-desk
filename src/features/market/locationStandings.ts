/**
 * Resolves a market location's broker-fee standings (issue #1238): the
 * character's standing toward the location's NPC owner corporation and that
 * corporation's faction, for `src/engine/industry/fees.ts`'s
 * `factionStanding`/`corpStanding` inputs.
 *
 * Player-structure orders never carry standings — `lookupNpcStation`
 * returning `null` (a known player structure) or `undefined` (the snapshot
 * itself could not be read, so this location's kind is unknown) both fall
 * back to zero without spending a request. A Trade Hub reads its stored owner
 * and faction (`src/market/hubs.ts`); every other NPC station reads them from
 * the station snapshot (issue #1675). Neither spends a request, so the pages
 * that resolve every order or hub (`openOrdersPageSnapshot`,
 * `useTradeHubStandings`) never fan out to ESI.
 */
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

  // A snapshot built before owner columns existed has no owner to resolve.
  if (snapshot.ownerCorporationId === undefined) return ZERO_STANDINGS;
  return resolveOwnerStandings(
    snapshot.ownerCorporationId,
    snapshot.ownerFactionId ?? null,
    standings
  );
}
