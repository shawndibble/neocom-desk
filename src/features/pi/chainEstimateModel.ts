/**
 * An ISK-a-day estimate for a P3 or P4: the multi-planet chain the Goal
 * Planner would lay out (`estimateChain` over `planBest`), on planets the
 * pilot would add for it.
 *
 * It takes the one-planet ranking's own assumptions (`ChainBasis`, built
 * beside the ranking, so one number model), plus what only a chain needs:
 *
 * - **Planets**: the fewest that cover every raw, at most two raws a planet
 *   (a colony runs two extractors), one of them a type that can host every
 *   factory in the chain (a P4's High-Tech Production Plant is only on Barren
 *   and Temperate). When that set cannot make it in full, a dedicated factory
 *   planet is added. All new planets: nothing the pilot runs today is moved.
 * - **Extractor heads**: the pilot's own count, stepped down when the factory
 *   planet cannot fit its extractors beside the factories, the rate scaled by
 *   heads kept.
 * - **Hauling**: every leg once, as m³. No jumps: the planets do not exist
 *   yet. The per-trip load uses the pilot's own haul cadence, never an
 *   assumed frequent one.
 */
import type { PiData } from '@/sde/types';
import { piTier } from '@/engine/pi/chain';
import { estimateChain } from '@/engine/pi/chainEstimate';
import { madeHighOf } from '@/engine/pi/goalPlanSteps/host';
import type { PlannerColony, PlanetType } from '@/engine/pi/goalTypes';
import type { SellBooks } from '@/engine/pi/planAdvice';
import type { PinLoad } from '@/engine/pi/types';
import { plannerPolicy } from './goalPlannerModel';
import type { RankingBasis } from './planAdviceModel';
import { hostsOf, planetTypesOf, rawInputsOf } from './productPlanets';

/** The ranking's own assumptions, as `buildPlanAdvice` resolved them. */
export interface ChainBasis extends RankingBasis {
  /** What a Command Center at `ccLevel` supplies. */
  budget: PinLoad;
  newLinkCost: PinLoad;
  headsPerExtractor: number;
  /** Raw units an hour one extractor pulls at `headsPerExtractor`. */
  ratePerHour: number;
  /** Customs, 0..1. */
  taxRate: number;
  /** The pilot's sell market's books: a hub, or a corp buyback. */
  books: SellBooks;
  /** Days between hauls, from the pilot's own cadence. */
  haulDays: number;
}

export interface ChainPlanet {
  type: PlanetType;
  /** The raws this planet is added for. */
  raws: number[];
}

export interface ChainEstimateView {
  typeId: number;
  /** Net ISK a day the whole chain earns, after customs and sales tax. */
  iskPerDay: number;
  unitsPerDay: number;
  /** One entry per planet the estimate adds, factory planet included. */
  planets: PlanetType[];
  /** The planet type the factories sit on. */
  hostType: PlanetType;
  m3PerWeek: number;
  /** m³ a trip at the pilot's haul cadence. */
  m3PerHaul: number;
  haulDays: number;
  ccLevel: number;
  ccAssumed: boolean;
  rateSource: ChainBasis['rateSource'];
  headsPerExtractor: number;
  ratePerHour: number;
}

/** Most raws one planet is added for: one per extractor, and `plannerPolicy` allows two P0 types a colony. */
export const RAWS_PER_PLANET = 2;

/** The solver's books and policy for a chain: the sell market's, nothing bought. */
export function chainPricing(basis: ChainBasis) {
  return {
    books: {
      ask: basis.books.prices,
      bid: basis.books.revenuePrices,
      salesTaxPct: basis.books.salesTaxPct,
    },
    policy: plannerPolicy({ maxP0Types: RAWS_PER_PLANET, buyTiers: [] }),
  };
}

const yields = (type: PlanetType, raw: number, pi: PiData) => hostsOf(raw, pi).includes(type);

interface ChainLayout {
  planets: ChainPlanet[];
  raws: number[];
  /** Types that carry the factory for every P2+ in the chain: what `planGoals` will host on. */
  hostTypes: PlanetType[];
}

/** Planet types, of `types`, that can host every P2+ factory in a product's chain. */
export function chainHostTypes(
  typeId: number,
  pi: PiData,
  types: readonly PlanetType[]
): PlanetType[] {
  const high = madeHighOf([{ typeId, unitsPerDay: 1 }], pi);
  return types.filter((type) =>
    high.every((id) => (pi.schematics[String(id)].planetTypes as readonly string[]).includes(type))
  );
}

function chainLayout(
  typeId: number,
  pi: PiData,
  allowed?: readonly PlanetType[]
): ChainLayout | null {
  const raws = rawInputsOf(typeId, pi);
  const all = planetTypesOf(pi);
  const types = allowed ? all.filter((type) => allowed.includes(type)) : all;
  const hostTypes = chainHostTypes(typeId, pi, types);
  if (raws.length === 0 || hostTypes.length === 0) return null;
  const planets: ChainPlanet[] = [];
  let left = raws;
  while (left.length > 0) {
    let best: { type: PlanetType; take: number[] } | null = null;
    for (const type of types) {
      const take = left.filter((raw) => yields(type, raw, pi)).slice(0, RAWS_PER_PLANET);
      if (take.length === 0) continue;
      const hostTie =
        best !== null &&
        take.length === best.take.length &&
        hostTypes.includes(type) &&
        !hostTypes.includes(best.type);
      if (best === null || take.length > best.take.length || hostTie) best = { type, take };
    }
    if (best === null) return null;
    planets.push({ type: best.type, raws: best.take });
    const taken = best.take;
    left = left.filter((raw) => !taken.includes(raw));
  }
  if (!planets.some((planet) => hostTypes.includes(planet.type))) {
    planets.push({ type: hostTypes[0], raws: [] });
  }
  return { planets, raws, hostTypes };
}

/**
 * The planets a chain is estimated on: the fewest that cover every raw, two
 * a planet, a factory-capable type first on a tie; a factory planet is added
 * when none of them can host. Null when some raw has no planet at all.
 */
export function chainPlanets(typeId: number, pi: PiData): ChainPlanet[] | null {
  return chainLayout(typeId, pi)?.planets ?? null;
}

/**
 * A planet the pilot would add, at the ranking's assumptions: `raws` at
 * `ratePerHour` each, nothing built on it yet.
 */
export function newPlanetColony(
  planetId: number,
  type: PlanetType,
  raws: readonly number[],
  basis: ChainBasis,
  heads = basis.headsPerExtractor,
  ratePerHour = basis.ratePerHour
): PlannerColony {
  return {
    planetId,
    planetType: type,
    budget: basis.budget,
    newLinkCost: basis.newLinkCost,
    headsPerExtractor: heads,
    taxRate: basis.taxRate,
    ratePerEcu: new Map(
      raws.map((raw) => [raw, { unitsPerHour: ratePerHour, source: 'assumed' as const }])
    ),
    current: { p0TypeIds: [], productTypeIds: [] },
  };
}

function coloniesFor(
  planets: readonly ChainPlanet[],
  raws: readonly number[],
  basis: ChainBasis,
  heads: number,
  ratePerHour: number,
  pi: PiData
): PlannerColony[] {
  // Every chain raw its type yields, so the planner may balance them.
  return planets.map((planet, i) =>
    newPlanetColony(
      i + 1,
      planet.type,
      raws.filter((raw) => yields(planet.type, raw, pi)),
      basis,
      heads,
      ratePerHour
    )
  );
}

/**
 * The estimate for a P3 or P4, or null: another tier, no price, or no layout
 * that makes it. `planetTypes` limits the planets to those types, and
 * `maxPlanets` refuses a layout needing more planets than that.
 */
export function buildChainEstimate(
  typeId: number,
  basis: ChainBasis,
  pi: PiData,
  options: { planetTypes?: readonly PlanetType[]; maxPlanets?: number } = {}
): ChainEstimateView | null {
  if (!pi.schematics[String(typeId)] || piTier(typeId, pi) < 3) return null;
  const layout = chainLayout(typeId, pi, options.planetTypes);
  if (!layout) return null;
  const { planets: covered, raws, hostTypes } = layout;
  const { books, policy } = chainPricing(basis);
  // A dedicated factory planet, unless the cover already ends in one.
  const layouts = covered.some((planet) => planet.raws.length === 0)
    ? [covered]
    : [covered, [...covered, { type: hostTypes[0], raws: [] }]];
  const heads: number[] = [];
  for (let h = basis.headsPerExtractor; h >= 1; h -= 2) heads.push(h);

  for (const planets of layouts) {
    if (options.maxPlanets !== undefined && planets.length > options.maxPlanets) continue;
    for (const headsPerExtractor of heads) {
      const ratePerHour = (basis.ratePerHour * headsPerExtractor) / basis.headsPerExtractor;
      const colonies = coloniesFor(planets, raws, basis, headsPerExtractor, ratePerHour, pi);
      const result = estimateChain({ typeId, colonies, policy, books }, pi);
      // Prices do not change with the layout: no point trying another.
      if (result.status === 'needs-price') return null;
      if (result.status === 'no-plan') continue;
      const hostId = result.best.plan.factoryHost?.planetId;
      if (hostId === undefined) continue;
      return {
        typeId,
        iskPerDay: result.iskPerDay,
        unitsPerDay: result.unitsPerDay,
        planets: planets.map((planet) => planet.type),
        hostType: planets[hostId - 1].type,
        m3PerWeek: result.m3PerWeek,
        m3PerHaul: (result.m3PerWeek * basis.haulDays) / 7,
        haulDays: basis.haulDays,
        ccLevel: basis.ccLevel,
        ccAssumed: basis.ccAssumed,
        rateSource: basis.rateSource,
        headsPerExtractor,
        ratePerHour,
      };
    }
  }
  return null;
}

/** Every P3 and P4, by typeId: what the estimates cover. */
export function chainProductIds(pi: PiData): number[] {
  return Object.keys(pi.schematics)
    .map(Number)
    .filter((typeId) => piTier(typeId, pi) >= 3)
    .sort((a, b) => a - b);
}
