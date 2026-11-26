import { getUniversePlanet } from '@/esi/endpoints';
import { loadStaticEntity } from '@/esi/cache';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

export async function planetInfo(
  planetIds: readonly number[]
): Promise<Map<number, { systemId: number; name: string | null }>> {
  const planets = new Map<number, { systemId: number; name: string | null }>();
  await mapWithConcurrencyLimit(planetIds, ESI_FANOUT_CONCURRENCY, async (planetId) => {
    try {
      const planet = (await loadStaticEntity('planet-info', planetId, getUniversePlanet))?.data;
      if (planet !== undefined) {
        planets.set(planetId, { systemId: planet.system_id, name: planet.name });
      }
    } catch {}
  });
  return planets;
}
