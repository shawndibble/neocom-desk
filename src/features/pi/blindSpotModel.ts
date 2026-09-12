/**
 * What the Advisor cannot answer, and why — collected rather than scattered.
 *
 * "What is not optimized?" includes "what can I not see?". A colony whose
 * extractors report no complete program, a planet whose radius never loaded, a
 * product the hub quotes no price for: none of these are faults in the colony,
 * and none of them can be acted on by placing a pin — but all three are
 * reasons a figure is missing, and a pilot who does not know that reads the
 * absence as "nothing to do here".
 *
 * These refusals used to sit on the cards that produced them, one line each,
 * where they competed with instructions for the same space. Now that the
 * instructions are one list, the refusals are one list too: a pilot can see
 * everything the tab declined to answer in one place, which is also the only
 * way to notice that half the colonies are unreadable.
 *
 * ## Nothing here is inferred
 *
 * Every row is a state one of the models already returns. This module maps
 * them; it never decides that something is unknowable. That distinction is
 * what keeps a loading failure (`detailLoaded: false`) separate from a genuine
 * absence (`extractedPerHour: []`) — see `advisorModel.ts`, which is emphatic
 * about the same split one level down.
 */
import type { PlanetAdvice } from './advisorModel';
import type { ColonyStopTierAdvice } from './stopTierModel';

/** Which sentence a row renders. Each maps to an existing `piAdvisor` key. */
export type BlindSpotReason =
  /** The colony's detail never loaded, so its pins are unknown rather than absent. */
  | 'detail-unavailable'
  /** No extractor here reports a complete program, so there is no measured rate. */
  | 'no-measured-extraction'
  /** Pins the snapshot does not recognise, so the load meter understates the draw. */
  | 'unknown-pins'
  /** The planet's radius never loaded, so this colony's links cannot be costed. */
  | 'needs-link-cost'
  /** The hub quotes no price for anything this planet could make. */
  | 'needs-prices'
  /** Nothing this planet yields covers its own customs tax. */
  | 'unprofitable'
  /** Everything that fits would overflow its buffer. */
  | 'throughput'
  /** The Command Center hosts no whole chain of anything here. */
  | 'does-not-fit'
  /** Different candidates stopped for different reasons. */
  | 'mixed';

export interface BlindSpot {
  key: string;
  planetId: number;
  planetName: string | null;
  reason: BlindSpotReason;
  /** For `unknown-pins` and `needs-link-cost`, the count the sentence needs. */
  count?: number;
}

export interface BlindSpotInput {
  advice: readonly PlanetAdvice[];
  /** The stop-tier answer for each built planet, by planet id. */
  stopTierByPlanet: ReadonlyMap<number, ColonyStopTierAdvice>;
}

/**
 * A stop-tier refusal is a blind spot; a recommendation is not.
 *
 * `no-recommendation` carries its own blocker, which is already the reason —
 * so it is mapped through rather than re-derived. A blocker this module does
 * not know about is dropped rather than guessed at, which is the conservative
 * direction: a missing row is quieter than a wrong sentence.
 */
function stopTierReason(result: ColonyStopTierAdvice | undefined): BlindSpotReason | null {
  if (!result) return null;
  if (result.status === 'needs-link-cost') return 'needs-link-cost';
  if (result.status === 'needs-measured-extraction') return null; // reported from the colony itself
  if (result.advice.kind !== 'no-recommendation') return null;
  switch (result.advice.blocker) {
    case 'needs-prices':
      return 'needs-prices';
    case 'unprofitable':
      return 'unprofitable';
    case 'throughput':
      return 'throughput';
    case 'does-not-fit':
      return 'does-not-fit';
    case 'mixed':
      return 'mixed';
    default:
      return null;
  }
}

export function blindSpots(input: BlindSpotInput): BlindSpot[] {
  const out: BlindSpot[] = [];

  for (const entry of input.advice) {
    if (entry.kind !== 'built') continue;
    const { colony, planetId } = entry;
    const at = (reason: BlindSpotReason, count?: number) =>
      out.push({
        key: `${planetId}:${reason}`,
        planetId,
        planetName: entry.name,
        reason,
        ...(count === undefined ? {} : { count }),
      });

    // A detail that never loaded makes every other reading about this colony
    // meaningless, so it is the only thing said about it.
    if (!colony.detailLoaded) {
      at('detail-unavailable');
      continue;
    }
    if (colony.extractedPerHour.length === 0) at('no-measured-extraction');
    if (colony.hasUnverifiedExtractors) at('unknown-pins', 1);

    const reason = stopTierReason(input.stopTierByPlanet.get(planetId));
    if (reason === 'needs-link-cost') at('needs-link-cost', colony.linkCount);
    else if (reason) at(reason);
  }

  return out;
}
