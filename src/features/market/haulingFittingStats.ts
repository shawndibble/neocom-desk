/**
 * The one place the Hauling page reaches the dogma engine, split out so
 * `haulingCargo.ts` can `import()` it: the engine's data is large and most
 * visits to the page never choose a ship.
 */
import { computeFittingStats } from '@/features/fittings/dogmaFittingEngine';
import { holdsFromStats, type CargoHold } from '@/engine/market/cargoHolds';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';

/**
 * The holds a Fitting can haul in under a pilot's skills: its general hold
 * (cargo hold plus fleet hangar, which take any item — a Deep Space Transport
 * carries most of its load in the hangar) and each Specialised Hold it has.
 */
export async function computeCargoHolds(
  fitting: Fitting,
  profile: PilotProfile
): Promise<CargoHold[]> {
  const stats = await computeFittingStats(fitting, profile, undefined, undefined, {
    overheated: false,
  });
  return holdsFromStats(stats.holds);
}
