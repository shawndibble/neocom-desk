/**
 * A contract's `start_location_id`/`end_location_id` carry no `location_type`
 * the way an asset or clone row does (round 7/14 precedent), so there is
 * nothing to branch on up front. Both `loadStationName` and `loadStructureName`
 * already resolve a lookup failure to `null` rather than throwing (offline,
 * 404, ACL 403), so trying the station endpoint first and falling back to the
 * structure endpoint is a safe, cheap way to cover both id spaces without a
 * magic-number id-range heuristic.
 */
import { loadStationName } from './stations';
import { loadStructureName } from './structures';

export async function loadContractLocationName(
  characterId: number,
  locationId: number
): Promise<string | null> {
  const stationName = await loadStationName(locationId);
  if (stationName) return stationName;
  return loadStructureName(characterId, locationId);
}
