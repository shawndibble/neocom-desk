/**
 * Where a skyhook is and how far: its planet's system and name, and jumps from
 * the Character's Current System. Shared by the Corp Board's Sovereignty
 * widget (#4775) and the Overview's Skyhook raids (#4798). Loaded behind
 * `import()` by both, never statically from the Overview's startup graph.
 */
import { getUniversePlanet } from '@/esi/endpoints';
import { loadStaticEntity } from '@/esi/cache';
import { loadCurrentSystemId } from '@/features/route/currentSystem';
import { jumpsBetween, loadJumpBasis } from '@/features/route/jumpBasis';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

/** Planet -> system and name for each skyhook; a planet that cannot be read is left out, not guessed. */
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
    } catch {
      // The row keeps its raid window and loses only its name.
    }
  });
  return planets;
}

/** Jumps from the Current System, under the Route Safety basis; empty when the origin is unknown. */
export async function jumpsFromCurrent(
  characterId: number,
  systemIds: readonly number[]
): Promise<Map<number, number>> {
  const jumps = new Map<number, number>();
  try {
    const origin = await loadCurrentSystemId(characterId);
    if (origin === null || systemIds.length === 0) return jumps;
    const basis = await loadJumpBasis();
    await Promise.all(
      systemIds.map(async (systemId) => {
        const result = await jumpsBetween(origin, systemId, basis);
        if (result.kind === 'known') jumps.set(systemId, result.jumps);
      })
    );
  } catch {
    // No distance column rather than a failed widget.
  }
  return jumps;
}
