import type { PlanetType } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { EXTRACTOR_HEADS_MAX } from '@/engine/pi/pinBudget';
import { recommendStopTier, type StopTierAdvice } from '@/engine/pi/stopTier';
import type { PinLoad } from '@/engine/pi/types';
import { type BuiltColonyAdvice } from './systemPlanetModel';
import { effectiveLocalResources } from './effectiveResources';
import { productBySchematicId } from './productMap';

export type ColonyStopTierAdvice =
  | {
      status: 'advised';
      advice: StopTierAdvice;
      alreadyRunning: boolean;
    }
  | { status: 'needs-link-cost'; linkCount: number }
  | { status: 'needs-measured-extraction' };

export interface ColonyStopTierInput {
  colony: BuiltColonyAdvice;
  planetType: PlanetType;
  pi: PiData;
  prices: Readonly<Record<number, number>>;
  revenuePrices?: Readonly<Record<number, number>>;
  taxRate: number;
  salesTaxPct: number;
  bufferHours: number;
  budgetOverride?: PinLoad;
  picked?: readonly number[];
}

export function meanExtractorRate(colony: BuiltColonyAdvice): number | null {
  const rates = colony.extractors
    .map((extractor) => extractor.ratePerHour)
    .filter((rate): rate is number => rate !== null && Number.isFinite(rate) && rate > 0);
  if (rates.length === 0) return null;
  return rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
}

export function meanHeadsPerExtractor(colony: BuiltColonyAdvice): number {
  const ecus = colony.pinLoad.counts.extractorControlUnit ?? 0;
  if (ecus <= 0) return 1;
  const mean = Math.round(colony.pinLoad.extractorHeads / ecus);
  return Math.min(EXTRACTOR_HEADS_MAX, Math.max(1, mean));
}

export function currentProductTypeIds(colony: BuiltColonyAdvice, pi: PiData): number[] {
  const productBySchematic = productBySchematicId(pi);
  return colony.production
    .map((group) =>
      group.schematicId === undefined ? undefined : productBySchematic.get(group.schematicId)
    )
    .filter((typeId): typeId is number => typeId !== undefined);
}

export function colonyStopTierAdvice(input: ColonyStopTierInput): ColonyStopTierAdvice {
  const { colony, planetType, pi, prices, revenuePrices, taxRate, salesTaxPct } = input;

  if (colony.linkCount > 0 && colony.pinLoad.linkLoad === null) {
    return { status: 'needs-link-cost', linkCount: colony.linkCount };
  }
  const rate = meanExtractorRate(colony);
  if (rate === null) return { status: 'needs-measured-extraction' };

  const linkLoad = colony.pinLoad.linkLoad ?? { cpu: 0, powergrid: 0 };
  const supply = input.budgetOverride ?? colony.budget;
  const budget = {
    cpu: Math.max(0, supply.cpu - linkLoad.cpu),
    powergrid: Math.max(0, supply.powergrid - linkLoad.powergrid),
  };

  const advice = recommendStopTier(
    {
      localResources: effectiveLocalResources(planetType, pi, input.picked).map(
        (resource) => resource.typeID
      ),
      budget,
      infrastructure: pi.infrastructure,
      overhead: {
        launchpads: Math.max(1, colony.pinLoad.counts.launchpad ?? 0),
        storageFacilities: colony.pinLoad.counts.storage ?? 0,
      },
      headsPerExtractor: meanHeadsPerExtractor(colony),
      ...(colony.pinLoad.newLinkLoad ? { newLinkCost: colony.pinLoad.newLinkLoad } : {}),
      extractionRatePerHour: rate,
      prices,
      ...(revenuePrices ? { revenuePrices } : {}),
      taxRate,
      salesTaxPct,
      linkCapacityPerHour: null,
      bufferHours: input.bufferHours,
    },
    pi
  );

  const running = currentProductTypeIds(colony, pi);
  const alreadyRunning =
    advice.kind === 'recommended' &&
    (advice.best.tier === 0
      ? colony.production.length === 0
      : running.includes(advice.best.typeId));

  return { status: 'advised', advice, alreadyRunning };
}
