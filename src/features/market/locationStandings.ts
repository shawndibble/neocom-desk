/**
 * Resolves a market location's broker-fee standings (issue #1238): the
 * character's standing toward the location's NPC owner corporation and that
 * corporation's faction, for `src/engine/industry/fees.ts`'s
 * `factionStanding`/`corpStanding` inputs.
 *
 * Player-structure orders never carry standings — `lookupNpcStation`
 * returning `null` (a known player structure) or `undefined` (the snapshot
 * itself could not be read, so this location's kind is unknown) both fall
 * back to zero without spending a request.
 */
import { lookupNpcStation } from '@/sde/npcStations';
import { loadStationOwner } from '@/features/character/stations';
import { loadPublicCorporationInfo } from '@/features/character/publicInfoData';
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
  const snapshot = await lookupNpcStation(locationId);
  if (snapshot === null || snapshot === undefined) return ZERO_STANDINGS;

  const ownerCorporationId = await loadStationOwner(locationId);
  if (ownerCorporationId === null) return ZERO_STANDINGS;

  const corp = await loadPublicCorporationInfo(ownerCorporationId);
  return resolveOwnerStandings(ownerCorporationId, corp?.faction_id ?? null, standings);
}
