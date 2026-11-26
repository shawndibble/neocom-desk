import type { PlanetType } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { EXTRACTOR_HEADS_MAX } from '@/engine/pi/pinBudget';
import { recommendStopTier, type StopTierAdvice } from '@/engine/pi/stopTier';
import type { PinLoad } from '@/engine/pi/types';
import { localResourcesFor } from './systemPlanetModel';
import type { MaxColonyBudget } from './colonyBudget';
import type { AssumedRate } from './richnessEstimate';

const ASSUMED_HEADS_PER_EXTRACTOR = EXTRACTOR_HEADS_MAX;

const ASSUMED_OVERHEAD = { launchpads: 1, storageFacilities: 0 } as const;

export type UnbuiltPlanAdvice =
  | { status: 'advised'; advice: StopTierAdvice }
  | { status: 'needs-pick' }
  | { status: 'needs-measured-extraction' }
  | { status: 'needs-link-cost' }
  | { status: 'needs-skill' };

export interface UnbuiltPlanInput {
  planetType: PlanetType;
  picked: readonly number[];
  pi: PiData;
  ceiling: MaxColonyBudget;
  rate: AssumedRate;
  assumedLinkCost: PinLoad | null;
  prices: Readonly<Record<number, number>>;
  revenuePrices: Readonly<Record<number, number>>;
  taxRate: number;
  salesTaxPct: number;
  bufferHours: number;
}

export function medianNewLinkLoad(hops: readonly PinLoad[]): PinLoad | null {
  if (hops.length === 0) return null;
  const sorted = [...hops].sort((a, b) => a.cpu - b.cpu);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

export function unbuiltPlanAdvice(input: UnbuiltPlanInput): UnbuiltPlanAdvice {
  const { planetType, picked, pi, ceiling, rate, assumedLinkCost, prices, taxRate } = input;

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
      newLinkCost: assumedLinkCost,
      extractionRatePerHour: rate.unitsPerHour,
      prices,
      revenuePrices: input.revenuePrices,
      taxRate,
      salesTaxPct: input.salesTaxPct,
      linkCapacityPerHour: null,
      bufferHours: input.bufferHours,
    },
    pi
  );

  return { status: 'advised', advice };
}
