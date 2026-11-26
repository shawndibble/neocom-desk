import type {
  CharacterPlanet,
  CharacterPlanetDetail,
  PlanetType,
  PlanetPin,
} from '@/esi/endpoints';
import type { PiData, PiRawResource } from '@/sde/types';
import { extractorState } from '@/engine/pi/colonyStatus';
import { hasYieldBaseline, sustainedRatePerHour } from '@/engine/pi/extraction';
import type { PinLoad } from '@/engine/pi/types';
import { colonyBudget } from './colonyBudgetModel';
import {
  colonyPinLoad,
  extractorExpiryMs,
  extractorProgramsFromPins,
  groupFactoryPins,
  hasUnverifiedExtractors,
  type ColonyPinLoad,
  type FactoryPinGroup,
} from '@/engine/pi/colonyPins';

export interface SystemPlanet {
  planetId: number;
  name: string | null;
  typeId: number | null;
}

export interface MeasuredExtractor {
  pinId: number;
  productTypeId: number | null;
  ratePerHour: number | null;
  expiryMs: number | null;
}

export interface BuiltColonyAdvice {
  upgradeLevel: number;
  budget: PinLoad;
  lastUpdate: string;
  detailLoaded: boolean;
  pinLoad: ColonyPinLoad;
  extractors: MeasuredExtractor[];
  extractedPerHour: { typeId: number; unitsPerHour: number }[];
  stoppedExtraction: { count: number; hoursStopped: number } | null;
  production: FactoryPinGroup[];
  linkCount: number;
  hasUnverifiedExtractors: boolean;
}

interface PlanetAdviceBase {
  planetId: number;
  name: string | null;
  planetType: PlanetType;
}

export type PlanetAdvice =
  | (PlanetAdviceBase & { kind: 'built'; colony: BuiltColonyAdvice })
  | (PlanetAdviceBase & {
      kind: 'unbuilt';
      localResources: PiRawResource[];
    })
  | { kind: 'uncolonisable'; planetId: number; name: string | null; planetType: null }
  | { kind: 'unknown-type'; planetId: number; name: string | null; planetType: null };

export interface SystemAdviceInput {
  planets: readonly SystemPlanet[];
  colonies: readonly CharacterPlanet[];
  details: ReadonlyMap<number, CharacterPlanetDetail>;
  planetRadiusKm?: ReadonlyMap<number, number>;
  nowMs: number;
}

function measureExtractors(pins: readonly PlanetPin[]): MeasuredExtractor[] {
  const productByPin = new Map<number, number | null>();
  for (const pin of pins) {
    if (!pin.extractor_details) continue;
    productByPin.set(pin.pin_id, pin.extractor_details.product_type_id ?? null);
  }
  const expiryByPin = new Map<number, number | null>(
    pins.map((pin) => [pin.pin_id, extractorExpiryMs(pin)])
  );

  return extractorProgramsFromPins(pins).map((program) => ({
    pinId: program.pinId,
    productTypeId: productByPin.get(program.pinId) ?? null,
    ratePerHour: hasYieldBaseline(program) ? sustainedRatePerHour(program) : null,
    expiryMs: expiryByPin.get(program.pinId) ?? null,
  }));
}

export function builtAdvice(
  planet: CharacterPlanet,
  detail: CharacterPlanetDetail | undefined,
  pi: PiData,
  planetRadiusKm: number | null,
  nowMs: number
): BuiltColonyAdvice {
  const pins = detail?.pins ?? [];
  const extractors = measureExtractors(pins);

  const order: number[] = [];
  const perProduct = new Map<number, number>();
  let stoppedCount = 0;
  let maxHoursStopped = 0;
  for (const extractor of extractors) {
    const { productTypeId, ratePerHour, expiryMs } = extractor;
    if (expiryMs !== null && extractorState(expiryMs, nowMs) === 'expired') {
      stoppedCount += 1;
      maxHoursStopped = Math.max(maxHoursStopped, (nowMs - expiryMs) / 3_600_000);
      continue;
    }
    if (productTypeId === null || ratePerHour === null) continue;
    if (!perProduct.has(productTypeId)) order.push(productTypeId);
    perProduct.set(productTypeId, (perProduct.get(productTypeId) ?? 0) + ratePerHour);
  }

  return {
    upgradeLevel: planet.upgrade_level,
    budget: colonyBudget(planet.upgrade_level, pi).budget,
    lastUpdate: planet.last_update,
    detailLoaded: detail !== undefined,
    pinLoad: colonyPinLoad(pins, pi, detail?.links ?? [], planetRadiusKm),
    extractors,
    extractedPerHour: order.map((typeId) => ({
      typeId,
      unitsPerHour: perProduct.get(typeId) as number,
    })),
    stoppedExtraction:
      stoppedCount === 0 ? null : { count: stoppedCount, hoursStopped: maxHoursStopped },
    production: groupFactoryPins(pins),
    linkCount: detail?.links.length ?? 0,
    hasUnverifiedExtractors: hasUnverifiedExtractors(pins),
  };
}

export function localResourcesFor(planetType: PlanetType, pi: PiData): PiRawResource[] {
  return pi.raw.filter((resource) => resource.planetTypes.includes(planetType));
}

const KIND_ORDER: Record<PlanetAdvice['kind'], number> = {
  built: 0,
  unbuilt: 1,
  'unknown-type': 2,
  uncolonisable: 3,
};

export function systemAdvice(input: SystemAdviceInput, pi: PiData): PlanetAdvice[] {
  const colonyByPlanet = new Map(input.colonies.map((colony) => [colony.planet_id, colony]));

  const advice = input.planets.map((planet): PlanetAdvice => {
    const colony = colonyByPlanet.get(planet.planetId);
    if (!colony && planet.typeId === null) {
      return {
        kind: 'unknown-type',
        planetId: planet.planetId,
        name: planet.name,
        planetType: null,
      };
    }
    const planetType = colony?.planet_type ?? pi.planetTypeByTypeId[String(planet.typeId)] ?? null;
    if (planetType === null) {
      return { kind: 'uncolonisable', planetId: planet.planetId, name: planet.name, planetType };
    }
    if (colony) {
      return {
        kind: 'built',
        planetId: planet.planetId,
        name: planet.name,
        planetType,
        colony: builtAdvice(
          colony,
          input.details.get(planet.planetId),
          pi,
          input.planetRadiusKm?.get(planet.planetId) ?? null,
          input.nowMs
        ),
      };
    }
    return {
      kind: 'unbuilt',
      planetId: planet.planetId,
      name: planet.name,
      planetType,
      localResources: localResourcesFor(planetType, pi),
    };
  });

  return advice.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.planetId - b.planetId);
}
