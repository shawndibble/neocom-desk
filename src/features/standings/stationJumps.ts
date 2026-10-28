import { jumpsFromCurrent } from '@/features/route/jumpsFromCurrent';
import { nearestNpcStation, type NearestNpcStation } from '@/features/loyalty/nearestNpcStation';
import { loadNpcStations } from '@/sde/loadMarketSde';
import { corporationStationFacts } from './stationFacts';

/**
 * The corporation's station nearest the Character's Current System, with its
 * jump count under the Route Safety basis (`jumpsFromCurrent`). `null` when no
 * count is known: no Current System, no station of theirs, or none reachable.
 * For jumps to an agent's or a faction capital's system, call
 * `jumpsFromCurrent` directly.
 */
export async function loadNearestStation(
  characterId: number,
  corporationId: number
): Promise<NearestNpcStation | null> {
  const stations = await loadNpcStations();
  const { systemIds } = corporationStationFacts(corporationId, stations);
  const jumps = await jumpsFromCurrent(characterId, systemIds);
  return nearestNpcStation(corporationId, stations, jumps);
}
