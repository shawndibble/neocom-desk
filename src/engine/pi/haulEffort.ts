/**
 * How much hauling a plan asks for: m3 moved an hour, weighted by the jumps
 * each leg covers. It is what separates two hosts whose nets are close — one
 * next door to the hub, one 28 jumps out — which m3 alone cannot.
 *
 * Distances come from the caller as a `JumpsFn` (the feature layer resolves
 * them on the pilot's route basis, asynchronously); the engine never routes.
 * A leg whose distance is unknown is **counted, not guessed**: it adds nothing
 * to `m3JumpsPerHour` and one to `unknownLegs`, so an unresolved distance
 * never penalises a candidate and the caller can say how complete the figure
 * is. A leg that stays put (the host feeding itself, a goal bought and kept)
 * moves nothing and is not a leg at all.
 *
 * Pure: legs, `PiData` and the distance function are parameters.
 */

import type { PiData } from '@/sde/types';
import type { FlowEnd, HaulEffort, JumpsFn } from './goalTypes';

/** m3 of one unit of a planetary commodity. */
export function volumeOf(typeId: number, pi: PiData): number {
  const schematic = pi.schematics[String(typeId)];
  if (schematic) return schematic.volume;
  const raw = pi.raw.find((r) => r.typeID === typeId);
  if (!raw) throw new Error(`${typeId} is not a planetary commodity`);
  return raw.volume;
}

/**
 * Jumps one leg covers: 0 for a leg that stays put, the caller's figure
 * otherwise (a hub leg is measured from its colony, either direction), null
 * when the caller gave no function or does not know.
 */
export function legJumps(from: FlowEnd, to: FlowEnd, jumps: JumpsFn | undefined): number | null {
  if (from === to) return 0;
  if (!jumps) return null;
  if (from === 'hub') return to === 'hub' ? 0 : jumps(to, 'hub');
  return jumps(from, to);
}

/** Σ m3/h × jumps over every leg that moves; unknown distances counted apart. */
export function haulEffortOf(
  legs: readonly { from: FlowEnd; to: FlowEnd; typeId: number; unitsPerHour: number }[],
  pi: PiData,
  jumps: JumpsFn | undefined
): HaulEffort {
  let m3JumpsPerHour = 0;
  let unknownLegs = 0;
  for (const leg of legs) {
    if (leg.from === leg.to || leg.unitsPerHour <= 0) continue;
    const count = legJumps(leg.from, leg.to, jumps);
    if (count === null) unknownLegs += 1;
    else m3JumpsPerHour += leg.unitsPerHour * volumeOf(leg.typeId, pi) * count;
  }
  return { m3JumpsPerHour, unknownLegs };
}
