import { loadCurrentSystemId } from '@/features/route/currentSystem';
import { loadJumpBasis } from '@/features/route/jumpBasis';
import { localJumpDistances } from '@/features/route/localRoute';
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

/**
 * Jumps from the Character's Current System to every system it can reach, in
 * one sweep under the Route Safety basis (a table asks about many places, so a
 * search per row is the cost to avoid). Null when the origin or the map is
 * unknown: no distance column rather than a failed table.
 */
export async function loadJumpsFromCurrent(
  characterId: number
): Promise<ReadonlyMap<number, number> | null> {
  try {
    const origin = await loadCurrentSystemId(characterId);
    if (origin === null) return null;
    const basis = await loadJumpBasis();
    const result = await localJumpDistances(origin, basis.rules, basis.network);
    return result.kind === 'known' ? result.jumps : null;
  } catch {
    return null;
  }
}
