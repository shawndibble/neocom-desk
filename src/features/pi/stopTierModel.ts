/**
 * The Advisor's "build up to here" line: a built colony's own measurements
 * turned into `engine/pi/stopTier.ts`'s parameters (issue #426).
 *
 * ## Why only a built colony gets one
 *
 * Fitting a layout means charging every pin against the Command Center's
 * budget, and a link is a pin with a cost that depends on the distance between
 * the two ends — which only a colony that exists has. #463 made a built
 * colony's link draw measurable (`colonyPinLoad`'s `linkLoad`), so its budget
 * can be reduced by a real number before anything is fitted into what is left.
 * An unbuilt planet has no links to measure, so the same fit would charge
 * nothing for them and overstate what fits by exactly the amount #440 was
 * filed about. CONTEXT.md round 53's "the estimate stays out of pin-fitting"
 * therefore still holds for unbuilt cards, and this is the built-only half
 * round 51 left open.
 *
 * The residual is stated rather than hidden: a bigger layout would need more
 * links than the colony has today, and reserving today's link load
 * under-reserves for that. It is the same residual the shipped "room for"
 * line already carries — `spareCapacity` prices an extra factory without the
 * link it would need — and it is bounded by a measurement rather than by an
 * assumption.
 *
 * ## Every input here is read off the colony, not assumed
 *
 * The extraction rate is the mean of this colony's *own* extractor programs,
 * off the decay curve. The head count is its own ECUs' mean. The overhead is
 * the Launchpad and Storage Facility it actually has, so a pilot who buffers
 * through storage is fitted against a colony that does too. That is what makes
 * this a recommendation for *this* colony rather than for a generic one, and
 * it is why an unmeasurable colony gets a refusal instead of a default.
 */

import type { PlanetType } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { EXTRACTOR_HEADS_MAX } from '@/engine/pi/pinBudget';
import { recommendStopTier, type StopTierAdvice } from '@/engine/pi/stopTier';
import type { ChainLayout } from '@/engine/pi/types';
import type { BuiltColonyAdvice } from './advisorModel';

/**
 * How long a colony is left to fill before someone hauls. The throughput
 * check needs one, and no ESI field answers it — it is a habit, not a fact.
 * A day is the shortest span that catches a layout which cannot survive being
 * ignored overnight, which is the failure worth flagging; a longer figure
 * would start rejecting layouts that are fine for anyone who logs in daily.
 */
export const ADVISOR_BUFFER_HOURS = 24;

/**
 * Every made tier is fitted on one planet, so nothing between them is taxed.
 * A recommendation is about the planet in front of you; spreading a chain
 * across planets is the Plan tab's question, and it has the control for it.
 */
const ADVISOR_LAYOUT: ChainLayout = 'single-planet';

export type ColonyStopTierAdvice =
  | {
      status: 'advised';
      advice: StopTierAdvice;
      /**
       * True when the colony is already running what was recommended.
       *
       * The score is a fit from scratch — what this planet would earn rebuilt
       * at that tier — so without this the card tells a pilot already making
       * Test Cultures to "build up to Test Cultures". It also sits directly
       * under the headroom line, which counts what could be *added*, and two
       * adjacent figures meaning different things is how one gets read as the
       * other.
       */
      alreadyRunning: boolean;
    }
  /** The planet's radius never resolved, so this colony's links cannot be costed (#440). */
  | { status: 'needs-link-cost'; linkCount: number }
  /** No extractor program here could be projected, so there is no rate of this colony's own. */
  | { status: 'needs-measured-extraction' };

export interface ColonyStopTierInput {
  colony: BuiltColonyAdvice;
  planetType: PlanetType;
  pi: PiData;
  /** Hub prices by typeID. A type the hub does not quote is absent, never zero. */
  prices: Readonly<Record<number, number>>;
  taxRate: number;
}

/**
 * The mean sustained rate of one of this colony's extractors.
 *
 * Per *extractor*, not per resource: `chainBlockPins` sizes one Extractor
 * Control Unit against it, so a colony's per-resource total — which sums two
 * extractors pulling the same thing — would size half the extractors a layout
 * actually needs.
 */
export function meanExtractorRate(colony: BuiltColonyAdvice): number | null {
  const rates = colony.extractors
    .map((extractor) => extractor.ratePerHour)
    .filter((rate): rate is number => rate !== null && Number.isFinite(rate) && rate > 0);
  if (rates.length === 0) return null;
  return rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
}

/**
 * Heads one of this colony's ECUs carries, on average and rounded.
 *
 * `fitColony` takes one figure for the whole layout, and a real colony's ECUs
 * are not uniform, so the mean is the only reading available. It is clamped
 * into the range that function accepts rather than allowed to throw: a
 * head-less colony is a data oddity, not a reason to lose the card.
 */
export function meanHeadsPerExtractor(colony: BuiltColonyAdvice): number {
  const ecus = colony.pinLoad.counts.extractorControlUnit ?? 0;
  if (ecus <= 0) return 1;
  const mean = Math.round(colony.pinLoad.extractorHeads / ecus);
  return Math.min(EXTRACTOR_HEADS_MAX, Math.max(1, mean));
}

/**
 * What this colony's factories are making right now, by product typeID.
 *
 * ESI reports a factory pin's *schematic* id; the recommendation names the
 * product it yields. `pi.schematics` is keyed by product and carries the
 * schematic id, so it is the one place that mapping exists.
 */
export function currentProductTypeIds(colony: BuiltColonyAdvice, pi: PiData): number[] {
  const productBySchematic = new Map(
    Object.entries(pi.schematics).map(([typeId, schematic]) => [
      schematic.schematicId,
      Number(typeId),
    ])
  );
  return colony.production
    .map((group) =>
      group.schematicId === undefined ? undefined : productBySchematic.get(group.schematicId)
    )
    .filter((typeId): typeId is number => typeId !== undefined);
}

export function colonyStopTierAdvice(input: ColonyStopTierInput): ColonyStopTierAdvice {
  const { colony, planetType, pi, prices, taxRate } = input;

  // Links first: without their cost the budget below is a fiction, and a
  // recommendation built on it would promise room this colony does not have.
  if (colony.linkCount > 0 && colony.pinLoad.linkLoad === null) {
    return { status: 'needs-link-cost', linkCount: colony.linkCount };
  }
  const rate = meanExtractorRate(colony);
  if (rate === null) return { status: 'needs-measured-extraction' };

  const linkLoad = colony.pinLoad.linkLoad ?? { cpu: 0, powergrid: 0 };
  const budget = {
    cpu: Math.max(0, colony.budget.cpu - linkLoad.cpu),
    powergrid: Math.max(0, colony.budget.powergrid - linkLoad.powergrid),
  };

  const advice = recommendStopTier(
    {
      localResources: pi.raw
        .filter((resource) => resource.planetTypes.includes(planetType))
        .map((resource) => resource.typeID),
      budget,
      infrastructure: pi.infrastructure,
      overhead: {
        // Nothing leaves a planet without a Launchpad, so one is the floor
        // even on a colony whose pins have not loaded.
        launchpads: Math.max(1, colony.pinLoad.counts.launchpad ?? 0),
        storageFacilities: colony.pinLoad.counts.storage ?? 0,
      },
      headsPerExtractor: meanHeadsPerExtractor(colony),
      extractionRatePerHour: rate,
      prices,
      taxRate,
      layout: ADVISOR_LAYOUT,
      // Never guessed. A basic link moves 1,250 m3/hr and each upgrade level
      // doubles it, but whether that axis is the same skill as the budget
      // table is unconfirmed, so the engine answers `link-capacity-unknown`
      // rather than picking a level (CONTEXT.md round 51).
      linkCapacityPerHour: null,
      bufferHours: ADVISOR_BUFFER_HOURS,
    },
    pi
  );

  // A tier-0 recommendation is "sell what you dig up", so the colony is
  // already there when it refines nothing — not when it happens to extract
  // that resource, which every candidate colony does.
  const running = currentProductTypeIds(colony, pi);
  const alreadyRunning =
    advice.kind === 'recommended' &&
    (advice.best.tier === 0
      ? colony.production.length === 0
      : running.includes(advice.best.typeId));

  return { status: 'advised', advice, alreadyRunning };
}
