/**
 * The solar system a place sits in, for "View route": a waypoint target can be
 * a system, an NPC station or an Upwell structure, and Route Safety only
 * takes systems. Resolution is async (the SDE snapshot, then ESI) — callers
 * resolve on click rather than for every row on screen. The classification
 * itself lives in `features/places`.
 */
import { resolvePlace } from '@/features/places';

/** `null` when the id is no place, or a structure the Character cannot see. */
export async function resolvePlaceSystemId(
  locationId: number,
  characterId: number | null
): Promise<number | null> {
  return (await resolvePlace({ locationId, characterId }, undefined, { name: false })).systemId;
}
