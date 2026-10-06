/**
 * An ISK-a-day estimate for a P3 or P4: the multi-planet chain the Goal
 * Planner would lay out (`estimateChain` over `planBest`), on planets the
 * pilot would add for it.
 *
 * The one-planet ranking cannot price these — no single planet yields every
 * raw under a P3 — so without this every P3 and P4 read "needs N planets" with
 * no figure, and a pilot could not tell whether a chain is worth doing.
 *
 * ## What it assumes, and says so
 *
 * The same assumptions the one-planet ranking makes (`ChainBasis`, built next
 * to the ranking in `planAdviceModel.ts`, so the two figures are one number
 * model): the pilot's measured extraction rate per extractor (else their typed
 * fallback), their Command Center level (else IV, flagged), a link cost
 * borrowed from their colonies (else a ~50 km hop), their median customs rate,
 * and their own sell market's books — a hub, or a corp buyback. Plus what only
 * a chain needs:
 *
 * - **Planets**: the fewest that cover every raw, at most two raws a planet
 *   (a colony runs two extractors), one of them a type that can host every
 *   factory in the chain (a P4's High-Tech Production Plant is only on Barren
 *   and Temperate). When that set cannot make it in full, a dedicated factory
 *   planet is added. All new planets: nothing the pilot runs today is moved.
 * - **Extractor heads**: the pilot's own count, stepped down when the factory
 *   planet cannot fit its extractors beside the factories, the rate scaled by
 *   heads kept.
 * - **Hauling**: every leg once — raws' P1 to the factory planet, everything
 *   sold to the market. No distances: the planets do not exist yet, so the
 *   load is m³, never jumps, and the per-haul load uses the pilot's own haul
 *   cadence rather than assuming frequent trips.
 * - **Nothing bought**: a chain that buys its inputs is a trade spread.
 *
 * The figure is the plan's absolute net (`estimateChain`), and stays out of
 * every one-planet ranking, pick and total: it is a different question.
 */
import type { PiData } from '@/sde/types';
import { piTier } from '@/engine/pi/chain';
import { estimateChain } from '@/engine/pi/chainEstimate';
import type { PlannerColony, PlanetType } from '@/engine/pi/goalTypes';
import type { SellBooks } from '@/engine/pi/planAdvice';
import type { PinLoad } from '@/engine/pi/types';
import { plannerPolicy } from './goalPlannerModel';
import { planetTypesOf, rawInputsOf } from './productPlanets';

/** The ranking's own assumptions, as `buildPlanAdvice` resolved them. */
export interface ChainBasis {
  /** The Command Center level every planet is assumed at. */
  ccLevel: number;
  /** The level is a stand-in: the pilot's skill never loaded. */
  ccAssumed: boolean;
  /** What a Command Center at `ccLevel` supplies. */
  budget: PinLoad;
  newLinkCost: PinLoad;
  linkCost: 'borrowed' | 'assumed';
  headsPerExtractor: number;
  /** Raw units an hour one extractor pulls at `headsPerExtractor`. */
  ratePerHour: number;
  rateSource: 'measured' | 'assumed';
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
  hostType: PlanetType | null;
  m3PerWeek: number;
  /** m³ a trip at the pilot's haul cadence. */
  m3PerHaul: number;
  haulDays: number;
  ccLevel: number;
  ccAssumed: boolean;
  rateSource: ChainBasis['rateSource'];
  linkCost: ChainBasis['linkCost'];
  headsPerExtractor: number;
  ratePerHour: number;
}

/** Most raws one planet is added for: a colony runs two extractors. */
const RAWS_PER_PLANET = 2;

/** Every made schematic under a product, the product included. */
function madeUnder(typeId: number, pi: PiData): number[] {
  const out = new Set<number>();
  const walk = (id: number) => {
    const schematic = pi.schematics[String(id)];
    if (!schematic || out.has(id)) return;
    out.add(id);
    for (const input of schematic.inputs) walk(input.typeID);
  };
  walk(typeId);
  return [...out];
}

/** Planet types that carry the factory for every P2+ in the chain. */
function hostTypesOf(typeId: number, pi: PiData): PlanetType[] {
  const high = madeUnder(typeId, pi).filter((id) => piTier(id, pi) >= 2);
  return planetTypesOf(pi).filter((type) =>
    high.every((id) => (pi.schematics[String(id)].planetTypes as readonly string[]).includes(type))
  );
}

function yields(type: PlanetType, raw: number, pi: PiData): boolean {
  return pi.raw.find((r) => r.typeID === raw)?.planetTypes.includes(type) ?? false;
}

/**
 * The planets a chain is estimated on: the fewest that cover every raw, two
 * a planet, a factory-capable type first on a tie; a factory planet is added
 * when none of them can host. Null when some raw has no planet at all.
 */
export function chainPlanets(typeId: number, pi: PiData): ChainPlanet[] | null {
  const raws = rawInputsOf(typeId, pi);
  const hostTypes = hostTypesOf(typeId, pi);
  if (raws.length === 0 || hostTypes.length === 0) return null;
  const types = planetTypesOf(pi);
  const planets: ChainPlanet[] = [];
  let left = raws;
  while (left.length > 0) {
    let best: PlanetType | null = null;
    let bestCount = 0;
    for (const type of types) {
      const count = Math.min(RAWS_PER_PLANET, left.filter((raw) => yields(type, raw, pi)).length);
      const hostTie =
        count === bestCount && count > 0 && hostTypes.includes(type) && !hostTypes.includes(best!);
      if (count > bestCount || hostTie) {
        best = type;
        bestCount = count;
      }
    }
    if (best === null) return null;
    const type = best;
    const take = left.filter((raw) => yields(type, raw, pi)).slice(0, RAWS_PER_PLANET);
    planets.push({ type, raws: take });
    left = left.filter((raw) => !take.includes(raw));
  }
  if (!planets.some((planet) => hostTypes.includes(planet.type))) {
    planets.push({ type: hostTypes[0], raws: [] });
  }
  return planets;
}

function coloniesFor(
  planets: readonly ChainPlanet[],
  raws: readonly number[],
  basis: ChainBasis,
  heads: number,
  pi: PiData
): PlannerColony[] {
  const ratePerHour = (basis.ratePerHour * heads) / basis.headsPerExtractor;
  return planets.map((planet, i) => ({
    planetId: i + 1,
    planetType: planet.type,
    budget: basis.budget,
    newLinkCost: basis.newLinkCost,
    headsPerExtractor: heads,
    taxRate: basis.taxRate,
    // Every chain raw its type yields, so the planner may balance them.
    ratePerEcu: new Map(
      raws
        .filter((raw) => yields(planet.type, raw, pi))
        .map((raw) => [raw, { unitsPerHour: ratePerHour, source: 'assumed' as const }])
    ),
    current: { p0TypeIds: [], productTypeIds: [] },
  }));
}

/** The estimate for a P3 or P4, or null: another tier, no price, or no layout that makes it. */
export function buildChainEstimate(
  typeId: number,
  basis: ChainBasis,
  pi: PiData
): ChainEstimateView | null {
  if (!pi.schematics[String(typeId)] || piTier(typeId, pi) < 3) return null;
  const covered = chainPlanets(typeId, pi);
  if (!covered) return null;
  const raws = rawInputsOf(typeId, pi);
  const hostTypes = hostTypesOf(typeId, pi);
  const books = {
    ask: basis.books.prices,
    bid: basis.books.revenuePrices,
    salesTaxPct: basis.books.salesTaxPct,
  };
  const policy = plannerPolicy({ maxP0Types: 2, buyTiers: [] });
  const layouts = [covered, [...covered, { type: hostTypes[0], raws: [] }]];
  const heads: number[] = [];
  for (let h = basis.headsPerExtractor; h >= 1; h -= 2) heads.push(h);

  for (const planets of layouts) {
    for (const headsPerExtractor of heads) {
      const colonies = coloniesFor(planets, raws, basis, headsPerExtractor, pi);
      const result = estimateChain({ typeId, colonies, policy, books }, pi);
      // Prices do not change with the layout: no point trying another.
      if (result.status === 'needs-price') return null;
      if (result.status === 'no-plan') continue;
      const hostId = result.best.plan.factoryHost?.planetId ?? null;
      return {
        typeId,
        iskPerDay: result.iskPerDay,
        unitsPerDay: result.unitsPerDay,
        planets: planets.map((planet) => planet.type),
        hostType: hostId === null ? null : planets[hostId - 1].type,
        m3PerWeek: result.m3PerWeek,
        m3PerHaul: (result.m3PerWeek * basis.haulDays) / 7,
        haulDays: basis.haulDays,
        ccLevel: basis.ccLevel,
        ccAssumed: basis.ccAssumed,
        rateSource: basis.rateSource,
        linkCost: basis.linkCost,
        headsPerExtractor,
        ratePerHour: (basis.ratePerHour * headsPerExtractor) / basis.headsPerExtractor,
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
