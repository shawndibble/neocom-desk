/**
 * The active character's current *region*, for the courier board's "From my
 * region" origin shortcut (issue #940).
 *
 * Two lookups, one of which is free: ESI answers with a solar system, and
 * `solarSystems.json` — a local snapshot, already indexed for the route and
 * endpoint work — says which region that system belongs to. So the region
 * costs exactly what the location costs, and the location itself costs
 * nothing while `loadCharacterSolarSystemId`'s cache row is still fresh.
 *
 * `null` for every way of not knowing, deliberately undifferentiated: a
 * character who signed in before `esi-location.read_location.v1` existed, one
 * who is offline, and one whose system the snapshot cannot place all leave the
 * shortcut with nothing to set. The caller shows the control as quietly
 * unavailable in each case — and `location.ts` already guarantees the 403 of
 * the first case never reaches the shell-wide re-auth banner.
 */
import { loadCharacterSolarSystemId } from '@/features/character/location';
import { lookupSolarSystem } from '@/sde/solarSystems';

/** The character's current region id, or `null` if unresolvable. */
export async function loadCharacterRegionId(characterId: number): Promise<number | null> {
  const systemId = await loadCharacterSolarSystemId(characterId);
  if (systemId === null) return null;
  const system = await lookupSolarSystem(systemId);
  return system?.regionId ?? null;
}
