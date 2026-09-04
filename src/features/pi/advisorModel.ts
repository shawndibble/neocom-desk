/**
 * One card per planet in a system, built or not — the Advisor tab's model.
 *
 * ## Measured beats estimated, and the two never blur
 *
 * A planet the character has a colony on is *read*, not guessed: its pins are
 * a fact ESI reports, and each running extractor's own program gives a
 * sustained units-per-hour through `engine/pi/extraction.ts`'s decay curve.
 * Nothing on a built card is an assumption.
 *
 * A planet with no colony has no such data, and — this is the part that
 * cannot be worked around — there is no ESI field for per-planet resource
 * richness at all. The in-game scan overlay shows a colour map, not a number.
 * So an unbuilt card lists which P0 resources that planet *type* yields and
 * stops there. It does not estimate an ISK figure, because the only inputs to
 * one would be a yield nobody has and a resource ranking the app does not yet
 * store. Naming the resources is useful and true; a number would be neither.
 *
 * The same rule runs one level down: an extractor whose program is missing
 * its install-time baseline (all three of `qty_per_cycle`, `cycle_time` and
 * `install_time` are spec-optional) reports `ratePerHour: null` and is left
 * out of `extractedPerHour` entirely, rather than contributing a zero that
 * would quietly drag the colony's measured total down.
 */

import type {
  CharacterPlanet,
  CharacterPlanetDetail,
  PlanetType,
  PlanetPin,
} from '@/esi/endpoints';
import type { PiData, PiRawResource } from '@/sde/types';
import { hasYieldBaseline, sustainedRatePerHour } from '@/engine/pi/extraction';
import type { PinLoad } from '@/engine/pi/types';
import { colonyBudget } from './colonyBudget';
import {
  colonyPinLoad,
  extractorExpiryMs,
  extractorProgramsFromPins,
  groupFactoryPins,
  hasUnverifiedExtractors,
  type ColonyPinLoad,
  type FactoryPinGroup,
} from './adapters';

/** One planet as the system lookup found it, before any colony is matched to it. */
export interface SystemPlanet {
  planetId: number;
  /** `/universe/planets` name, or null while it is still unresolved. */
  name: string | null;
  /**
   * The planet's own typeID, which `PiData.planetTypeByTypeId` turns into a
   * `PlanetType`. `null` when the lookup has not resolved — which is a
   * different answer from a typeID the payload maps to nothing, and must stay
   * different: the first means "we don't know yet", the second means "no
   * colony can go here".
   */
  typeId: number | null;
}

export interface MeasuredExtractor {
  pinId: number;
  /** What it pulls; null when ESI did not say. */
  productTypeId: number | null;
  /**
   * Sustained units an hour across the whole program, off the decay curve.
   * Null when the program carries no install-time baseline to project from —
   * unmeasured, which is not the same as none.
   */
  ratePerHour: number | null;
  expiryMs: number | null;
}

export interface BuiltColonyAdvice {
  /** The colony's own Command Center upgrade level, from ESI. */
  upgradeLevel: number;
  /**
   * What this colony's Command Center supplies at that level — measured, per
   * colony, never the pilot's skill ceiling. See `colonyBudget.ts` for why
   * that distinction is the difference between a headroom figure that holds
   * and one that overstates.
   */
  budget: PinLoad;
  /** ESI's own last-update stamp for the colony. */
  lastUpdate: string;
  /** False when the colony's detail never loaded, so the pins below are empty for want of data rather than for want of pins. */
  detailLoaded: boolean;
  /** What the colony actually draws, from its own pins. */
  pinLoad: ColonyPinLoad;
  extractors: MeasuredExtractor[];
  /**
   * Measured P0 an hour, summed per product across every extractor that
   * could be projected. Empty when none could — the colony then has pins but
   * no rate, and no card may print one.
   */
  extractedPerHour: { typeId: number; unitsPerHour: number }[];
  /** One entry per distinct schematic running, with its pin count. */
  production: FactoryPinGroup[];
  /** True when an extractor pin had to be dropped for missing data, so the numbers above are incomplete. */
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
      /** Every P0 this planet type yields, in payload order. Which of them is richest is a scan question no ESI field answers. */
      localResources: PiRawResource[];
    })
  /** A planet no colony can be placed on — Shattered, Scorched Barren — which the payload maps to no `PlanetType`. */
  | { kind: 'uncolonisable'; planetId: number; name: string | null; planetType: null }
  /**
   * The planet's type has not resolved, so nothing can be said about it yet.
   * Deliberately not folded into `uncolonisable`: that card asserts "no
   * colony can be placed here", which would be a confident false claim about
   * a planet whose `/universe/planets` read simply failed.
   */
  | { kind: 'unknown-type'; planetId: number; name: string | null; planetType: null };

export interface SystemAdviceInput {
  /** Every planet in the system, from `/universe/systems/{id}`. */
  planets: readonly SystemPlanet[];
  /** The character's colonies, filtered to this system by the caller. */
  colonies: readonly CharacterPlanet[];
  /** Colony detail by planet id; a missing entry is a detail that did not load. */
  details: ReadonlyMap<number, CharacterPlanetDetail>;
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

function builtAdvice(
  planet: CharacterPlanet,
  detail: CharacterPlanetDetail | undefined,
  pi: PiData
): BuiltColonyAdvice {
  const pins = detail?.pins ?? [];
  const extractors = measureExtractors(pins);

  // Summed per product, and only over extractors that could be projected.
  // Order follows first appearance so two extractors on one resource read as
  // one line rather than reordering the card between refreshes.
  const order: number[] = [];
  const perProduct = new Map<number, number>();
  for (const extractor of extractors) {
    const { productTypeId, ratePerHour } = extractor;
    if (productTypeId === null || ratePerHour === null) continue;
    if (!perProduct.has(productTypeId)) order.push(productTypeId);
    perProduct.set(productTypeId, (perProduct.get(productTypeId) ?? 0) + ratePerHour);
  }

  return {
    upgradeLevel: planet.upgrade_level,
    budget: colonyBudget(planet.upgrade_level, pi).budget,
    lastUpdate: planet.last_update,
    detailLoaded: detail !== undefined,
    pinLoad: colonyPinLoad(pins, pi),
    extractors,
    extractedPerHour: order.map((typeId) => ({
      typeId,
      unitsPerHour: perProduct.get(typeId) as number,
    })),
    production: groupFactoryPins(pins),
    hasUnverifiedExtractors: hasUnverifiedExtractors(pins),
  };
}

/** Ordered so the cards carrying real numbers lead, then the ones that could. */
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
    // An owned colony carries its own `planet_type`, so it never depends on
    // the planet lookup succeeding. An unresolved typeID therefore only
    // matters for a planet ESI says nothing about — and it has to stay
    // distinct from a typeID that resolves to no planet type, because those
    // are "we don't know yet" and "no colony can go here", not one state.
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
        colony: builtAdvice(colony, input.details.get(planet.planetId), pi),
      };
    }
    return {
      kind: 'unbuilt',
      planetId: planet.planetId,
      name: planet.name,
      planetType,
      localResources: pi.raw.filter((resource) => resource.planetTypes.includes(planetType)),
    };
  });

  return advice.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.planetId - b.planetId);
}
