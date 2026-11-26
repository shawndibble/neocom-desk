import { loadCurrentSystemId } from '@/features/route/currentSystem';
import { loadJumpBasis } from '@/features/route/jumpBasis';
import { localJumpDistances } from '@/features/route/localRoute';
import { jumpsFromCurrent } from '@/features/route/jumpsFromCurrent';
import { nearestNpcStation, type NearestNpcStation } from '@/features/loyalty/nearestNpcStation';
import { loadNpcStations } from '@/sde/loadMarketSde';
import { corporationStationFacts } from './stationFacts';

export async function loadNearestStation(
  characterId: number,
  corporationId: number
): Promise<NearestNpcStation | null> {
  const stations = await loadNpcStations();
  const { systemIds } = corporationStationFacts(corporationId, stations);
  const jumps = await jumpsFromCurrent(characterId, systemIds);
  return nearestNpcStation(corporationId, stations, jumps);
}

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
