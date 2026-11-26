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

export interface ChainBasis extends RankingBasis {
  budget: PinLoad;
  newLinkCost: PinLoad;
  headsPerExtractor: number;
  ratePerHour: number;
  taxRate: number;
  books: SellBooks;
  haulDays: number;
}

export interface ChainPlanet {
  type: PlanetType;
  raws: number[];
}

export interface ChainEstimateView {
  typeId: number;
  iskPerDay: number;
  unitsPerDay: number;
  planets: PlanetType[];
  hostType: PlanetType;
  m3PerWeek: number;
  m3PerHaul: number;
  haulDays: number;
  ccLevel: number;
  ccAssumed: boolean;
  rateSource: ChainBasis['rateSource'];
  headsPerExtractor: number;
  ratePerHour: number;
}

export const RAWS_PER_PLANET = 2;

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
  hostTypes: PlanetType[];
}

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

export function chainPlanets(typeId: number, pi: PiData): ChainPlanet[] | null {
  return chainLayout(typeId, pi)?.planets ?? null;
}

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

export function chainProductIds(pi: PiData): number[] {
  return Object.keys(pi.schematics)
    .map(Number)
    .filter((typeId) => piTier(typeId, pi) >= 3)
    .sort((a, b) => a - b);
}
