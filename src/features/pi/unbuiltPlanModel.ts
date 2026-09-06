/**
 * "Build this here" for a planet with no colony on it yet — the other half of
 * `stopTierModel.ts`.
 *
 * ## Why this exists, and what it deliberately overrides
 *
 * `stopTierModel.ts` states the rule this module breaks: an unbuilt planet has
 * no links to measure, so fitting a layout against its budget would charge
 * nothing for links and overstate what fits by exactly the amount #440 was
 * filed about. CONTEXT.md rounds 51/53/56 wrote that down as "the estimate
 * stays out of pin-fitting".
 *
 * That rule cost the ranker its purpose. A pilot could record which resources
 * a planet is rich in and the app would answer with one ISK-per-hour figure
 * for one extractor — never "so build this". The ranking decided nothing, and
 * a control that decides nothing is worse than no control.
 *
 * So the fit happens, on one condition: **the link cost is borrowed, never
 * invented**. Every pin of a fitted layout is charged the pilot's own median
 * hop, measured off their existing colonies. With no colony to measure, this
 * refuses rather than fitting links at zero — which keeps the part of the old
 * rule that mattered. See `docs/context/decisions/` for the scope decision.
 *
 * ## Everything else here refuses rather than assumes
 *
 * Four inputs, four refusals, each naming what is missing: nothing picked, no
 * measured extraction to project from, no hop to borrow, and no trained
 * Command Center ceiling. The last follows the rule the slot count and the
 * header chip already follow — an assumed figure may be shown, never acted on
 * — because untrained is one level and fitting against it would tell a pilot
 * at Command Center Upgrades V that nothing fits here.
 */

import type { PlanetType } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { EXTRACTOR_HEADS_MAX } from '@/engine/pi/pinBudget';
import { recommendStopTier, type StopTierAdvice } from '@/engine/pi/stopTier';
import type { PinLoad } from '@/engine/pi/types';
import { localResourcesFor } from './advisorModel';
import type { MaxColonyBudget } from './colonyBudget';
import type { AssumedRate } from './richnessEstimate';
import { ADVISOR_BUFFER_HOURS } from './stopTierModel';

/**
 * Heads a hypothetical extractor is fitted with: a full complement, matching
 * the built cards' headroom row. An ECU fitted with fewer heads reaches less,
 * so quoting the cheap end would fit more blocks than a pilot would actually
 * build — and this figure is already an estimate without also being optimistic.
 */
const ASSUMED_HEADS_PER_EXTRACTOR = EXTRACTOR_HEADS_MAX;

/**
 * What a colony needs before it can export anything: one Launchpad, no
 * buffering storage. The floor rather than a habit — a pilot who buffers
 * through Storage Facilities builds a smaller chain than this, and
 * overstating the overhead would refuse layouts that do fit.
 */
const ASSUMED_OVERHEAD = { launchpads: 1, storageFacilities: 0 } as const;

export type UnbuiltPlanAdvice =
  | { status: 'advised'; advice: StopTierAdvice }
  /** Nothing ticked yet, so there is no candidate set to score. */
  | { status: 'needs-pick' }
  /** The pilot has no projectable extraction anywhere to borrow a rate from. */
  | { status: 'needs-measured-extraction' }
  /** No colony of theirs could supply a hop, so links cannot be charged for. */
  | { status: 'needs-link-cost' }
  /** The Command Center ceiling was assumed untrained, and an assumed figure is never acted on. */
  | { status: 'needs-skill' };

export interface UnbuiltPlanInput {
  planetType: PlanetType;
  /** P0 typeIDs the pilot said they would pull here. Empty means they have not said. */
  picked: readonly number[];
  pi: PiData;
  /** What a colony placed here could supply, from the pilot's own skill. */
  ceiling: MaxColonyBudget;
  /** The mean of the pilot's own measured extractors — see `richnessEstimate.ts`. */
  rate: AssumedRate;
  /** The hop every pin's link is charged at, borrowed from their own colonies. */
  assumedLinkCost: PinLoad | null;
  /** Hub price per unit by typeID. A missing entry is unpriced, never zero. */
  prices: Readonly<Record<number, number>>;
  /** What a sale fetches — highest hub buy, falling back to the ask. */
  revenuePrices?: Readonly<Record<number, number>>;
  taxRate: number;
}

/**
 * The pilot's typical link, as one coherent pair.
 *
 * The middle entry by CPU, whole — not the median of each axis taken
 * separately, which would describe a hop none of their colonies has. Both
 * axes scale with the same distance, so the pair has to travel together.
 *
 * Null on an empty set, which the caller must turn into a refusal: a colony
 * fitted with free links is the failure this whole module is guarding.
 */
export function medianNewLinkLoad(hops: readonly PinLoad[]): PinLoad | null {
  if (hops.length === 0) return null;
  const sorted = [...hops].sort((a, b) => a.cpu - b.cpu);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * What to build on a planet the pilot has not colonised, scored over the
 * resources they said they would pull out of it.
 *
 * The result is an estimate and every caller must badge it as one: the
 * extraction rate is their own colonies' average rather than this planet's
 * richness, which no ESI field reports, and the link cost is a borrowed hop
 * rather than a measured one.
 */
export function unbuiltPlanAdvice(input: UnbuiltPlanInput): UnbuiltPlanAdvice {
  const { planetType, picked, pi, ceiling, rate, assumedLinkCost, prices, taxRate } = input;

  // The planet's own resource list stays the authority: picks are durable and
  // planet types change between patches, so a stale pick is dropped rather
  // than scored as a resource this planet does not yield.
  const local = new Set(localResourcesFor(planetType, pi).map((resource) => resource.typeID));
  const localResources = picked.filter((typeId) => local.has(typeId));

  if (localResources.length === 0) return { status: 'needs-pick' };
  if (rate.kind !== 'measured-own-colonies') return { status: 'needs-measured-extraction' };
  if (assumedLinkCost === null) return { status: 'needs-link-cost' };
  if (ceiling.assumed) return { status: 'needs-skill' };

  const advice = recommendStopTier(
    {
      localResources,
      budget: ceiling.budget,
      infrastructure: pi.infrastructure,
      overhead: ASSUMED_OVERHEAD,
      headsPerExtractor: ASSUMED_HEADS_PER_EXTRACTOR,
      // Charged per pin of whatever layout is fitted. This is the borrowed
      // number, and the reason this module can fit at all.
      newLinkCost: assumedLinkCost,
      extractionRatePerHour: rate.unitsPerHour,
      prices,
      ...(input.revenuePrices ? { revenuePrices: input.revenuePrices } : {}),
      taxRate,
      // Never guessed, same as the built colonies' line — the engine answers
      // `link-capacity-unknown` rather than picking a level.
      linkCapacityPerHour: null,
      bufferHours: ADVISOR_BUFFER_HOURS,
    },
    pi
  );

  return { status: 'advised', advice };
}
