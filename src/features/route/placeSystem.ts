/**
 * The solar system a place sits in, for "View route": a waypoint target can be
 * a system, an NPC station or an Upwell structure, and Route Safety only
 * takes systems. Resolution is async (the SDE snapshot, then ESI) — callers
 * resolve on click rather than for every row on screen.
 */
import { isNpcStationId, UPWELL_STRUCTURE_ID_FLOOR } from '@/esi/locationIds';
import { loadStationSystemId } from '@/features/character/stations';
import { loadStructureSystemId } from '@/features/character/structures';

/** CCP's solar system id block: 30,000,000–32,999,999 (k-space, w-space, Abyssal). */
function isSolarSystemId(id: number): boolean {
  return id >= 30_000_000 && id < 33_000_000;
}

/** `null` when the id is no place, or a structure the Character cannot see. */
export async function resolvePlaceSystemId(
  locationId: number,
  characterId: number | null
): Promise<number | null> {
  if (isSolarSystemId(locationId)) return locationId;
  if (isNpcStationId(locationId)) return loadStationSystemId(locationId);
  if (locationId >= UPWELL_STRUCTURE_ID_FLOOR && characterId !== null) {
    return loadStructureSystemId(characterId, locationId);
  }
  return null;
}
