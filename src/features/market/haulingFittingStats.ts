/**
 * The one place the Hauling page reaches the dogma engine, split out so
 * `haulingCargo.ts` can `import()` it: the engine's data is large and most
 * visits to the page never choose a ship.
 */
import { computeFittingStats } from '@/features/fittings/dogmaFittingEngine';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';

/** The cargo hold, in m³, of a Fitting under a pilot's skills. */
export async function computeCargoM3(fitting: Fitting, profile: PilotProfile): Promise<number> {
  const stats = await computeFittingStats(fitting, profile, undefined, undefined, {
    overheated: false,
  });
  return stats.holds.cargo;
}
