/**
 * Plan's **Bigger chains**: P3 and P4 made across several of the pilot's
 * planets, offered only when they opted in to hauling between them
 * (`piSettings.haulBetweenPlanets`). Never part of the one-planet picks, the
 * quick wins or any total: this is a separate answer beside them.
 *
 * Two layouts, both limited to the planet types the pilot already runs:
 *
 * - **On their colonies**: the Goal Planner's solver (`estimateChain` over
 *   `planBest`) on the pilot's real colonies, with their own measured rates,
 *   Command Centers and customs. The chain's figure is what the colonies it
 *   uses earn under it (`perColony`), so a colony it leaves alone keeps its own
 *   pick. Jumps between colonies come from the pilot's route basis.
 * - **On new planets**: the multi-planet estimate (`buildChainEstimate`) on new
 *   planets of the pilot's types, when the chain fits their free planet slots.
 *   The planets do not exist yet, so no distance is known.
 *
 * A chain is recommended only when it beats the same number of planets on
 * their best one-planet picks: the colonies it uses after their quick wins and
 * rebuild, or a free slot each at the best one-planet recipe (the slot nudge's
 * own figure). A side with no figure is no comparison, never a win.
 *
 * Pure: colonies, assumptions, jumps and prices are parameters.
 */
import type { PiData } from '@/sde/types';
import { estimateChain } from '@/engine/pi/chainEstimate';
import { haulingOf } from '@/engine/pi/goalPlanSteps/flows';
import type { JumpsFn, PlannerColony, PlanetType } from '@/engine/pi/goalTypes';
import { HOURS_PER_DAY } from '@/engine/pi/planAdvice';
import {
  buildChainEstimate,
  chainHostTypes,
  chainPricing,
  chainProductIds,
  type ChainBasis,
  type ChainEstimateView,
} from './chainEstimateModel';
import { rawInputsOf } from './productPlanets';

/** One haul between two of the chain's colonies. */
export interface ChainLeg {
  from: number;
  to: number;
  /** Gate jumps, null when the route is not known. */
  jumps: number | null;
}

export interface ColonyChainEstimate {
  typeId: number;
  /** What the colonies the chain uses earn under it, a day, after customs and sales tax. */
  iskPerDay: number;
  unitsPerDay: number;
  /** The colonies the chain uses, by planet id, ascending. */
  planetIds: number[];
  /** The colony the factories sit on. */
  hostId: number;
  /** m³ a week the chain's colonies move, every leg once. */
  m3PerWeek: number;
  legs: ChainLeg[];
}

/** Both layouts for one product; null where that layout has no figure. */
export interface BiggerChainEstimates {
  colonies: ColonyChainEstimate | null;
  newPlanets: ChainEstimateView | null;
}

/**
 * The P3s and P4s the pilot's own planet types can make: every raw yielded by
 * one of their colonies, and one of them a type that hosts every factory.
 */
export function biggerChainCandidates(colonies: readonly PlannerColony[], pi: PiData): number[] {
  if (colonies.length === 0) return [];
  const yielded = new Set(colonies.flatMap((colony) => [...colony.ratePerEcu.keys()]));
  const types = [...new Set(colonies.map((colony) => colony.planetType))];
  return chainProductIds(pi).filter((typeId) => {
    if (!rawInputsOf(typeId, pi).every((raw) => yielded.has(raw))) return false;
    return chainHostTypes(typeId, pi, types).length > 0;
  });
}

/** The chain on the pilot's colonies, or null: no price, or no plan that makes it in full. */
export function estimateOnColonies(
  typeId: number,
  colonies: readonly PlannerColony[],
  basis: ChainBasis,
  jumps: JumpsFn | undefined,
  pi: PiData
): ColonyChainEstimate | null {
  const result = estimateChain(
    {
      typeId,
      colonies,
      ...chainPricing(basis),
      ...(jumps ? { jumps } : {}),
    },
    pi
  );
  if (result.status !== 'estimated') return null;
  const { plan, economics } = result.best;
  const hostId = plan.factoryHost?.planetId;
  if (hostId === undefined || economics.status !== 'costed') return null;
  const used = new Set(
    plan.assignments
      .filter((a) => a.role === 'extract' || a.role === 'factory')
      .map((a) => a.planetId)
  );
  used.add(hostId);
  const touches = plan.flows.filter(
    (f) => (f.from !== 'hub' && used.has(f.from)) || (f.to !== 'hub' && used.has(f.to))
  );
  let iskPerHour = 0;
  for (const id of used) iskPerHour += economics.perColony.get(id)?.planIskPerHour ?? 0;

  const legs = new Map<string, ChainLeg>();
  for (const f of touches) {
    if (f.from === 'hub' || f.to === 'hub' || f.from === f.to) continue;
    const key = `${f.from}-${f.to}`;
    if (!legs.has(key)) legs.set(key, { from: f.from, to: f.to, jumps: f.jumps ?? null });
  }
  return {
    typeId,
    iskPerDay: iskPerHour * HOURS_PER_DAY,
    unitsPerDay: result.unitsPerDay,
    planetIds: [...used].sort((a, b) => a - b),
    hostId,
    m3PerWeek: haulingOf(touches, pi).m3PerWeek,
    legs: [...legs.values()].sort((a, b) => a.from - b.from || a.to - b.to),
  };
}

/** The chain on new planets of the pilot's types, or null: it needs more than `freeSlots`, or no figure. */
export function estimateOnNewPlanets(
  typeId: number,
  types: readonly PlanetType[],
  freeSlots: number,
  basis: ChainBasis,
  pi: PiData
): ChainEstimateView | null {
  return buildChainEstimate(typeId, basis, pi, { planetTypes: types, maxPlanets: freeSlots });
}

export type BiggerChainVerdict = 'beats' | 'short' | 'unknown';

interface CardBase {
  typeId: number;
  iskPerDay: number;
  m3PerWeek: number;
  /** m³ a trip at the pilot's haul cadence. */
  m3PerHaul: number;
  /** What the same planets earn on their best one-planet picks; null when any has no figure. */
  versusPerDay: number | null;
  /** `iskPerDay − versusPerDay`; null with no comparison. */
  gainPerDay: number | null;
  verdict: BiggerChainVerdict;
}

export type BiggerChainCard =
  | (CardBase & { kind: 'colonies'; planetIds: number[]; hostId: number; legs: ChainLeg[] })
  | (CardBase & { kind: 'new-planets'; estimate: ChainEstimateView });

export interface BiggerChainsView {
  /** Chains that beat the one-planet picks, most gained first. */
  recommended: BiggerChainCard[];
  /** Chains with a figure that do not, or cannot be compared: shown apart, never recommended. */
  others: BiggerChainCard[];
}

export interface BiggerChainsInput {
  estimates: ReadonlyMap<number, BiggerChainEstimates>;
  /** Each colony after its quick wins and rebuild (Plan's own figure); null when unknown. */
  afterRebuildPerDay: ReadonlyMap<number, number | null>;
  /** Free planet slots, and what one earns at the best one-planet recipe (the slot nudge's figure). */
  slots: { free: number; gainPerPlanetPerDay: number | null };
  haulDays: number;
}

function verdictOf(iskPerDay: number, versusPerDay: number | null) {
  if (versusPerDay === null) {
    return { versusPerDay: null, gainPerDay: null, verdict: 'unknown' as const };
  }
  const gainPerDay = iskPerDay - versusPerDay;
  return {
    versusPerDay,
    gainPerDay,
    verdict: gainPerDay > 0 ? ('beats' as const) : ('short' as const),
  };
}

function colonyCard(estimate: ColonyChainEstimate, input: BiggerChainsInput): BiggerChainCard {
  let versus: number | null = 0;
  for (const id of estimate.planetIds) {
    const figure = input.afterRebuildPerDay.get(id);
    if (figure === null || figure === undefined || versus === null) versus = null;
    else versus += figure;
  }
  return {
    kind: 'colonies',
    typeId: estimate.typeId,
    iskPerDay: estimate.iskPerDay,
    m3PerWeek: estimate.m3PerWeek,
    m3PerHaul: (estimate.m3PerWeek * input.haulDays) / 7,
    planetIds: estimate.planetIds,
    hostId: estimate.hostId,
    legs: estimate.legs,
    ...verdictOf(estimate.iskPerDay, versus),
  };
}

function newPlanetCard(view: ChainEstimateView, input: BiggerChainsInput): BiggerChainCard {
  const perSlot = input.slots.gainPerPlanetPerDay;
  return {
    kind: 'new-planets',
    typeId: view.typeId,
    iskPerDay: view.iskPerDay,
    m3PerWeek: view.m3PerWeek,
    m3PerHaul: view.m3PerHaul,
    estimate: view,
    ...verdictOf(view.iskPerDay, perSlot === null ? null : perSlot * view.planets.length),
  };
}

const RANK: Record<BiggerChainVerdict, number> = { beats: 0, short: 1, unknown: 2 };

/** Beats first, then the larger gain, then the larger figure. */
function better(a: BiggerChainCard, b: BiggerChainCard): number {
  return (
    RANK[a.verdict] - RANK[b.verdict] ||
    (b.gainPerDay ?? -Infinity) - (a.gainPerDay ?? -Infinity) ||
    b.iskPerDay - a.iskPerDay ||
    a.typeId - b.typeId
  );
}

/** One card a product (the layout that does best), split into recommended and the rest. */
export function biggerChainsView(input: BiggerChainsInput): BiggerChainsView {
  const cards: BiggerChainCard[] = [];
  for (const estimate of input.estimates.values()) {
    const options: BiggerChainCard[] = [];
    if (estimate.colonies) options.push(colonyCard(estimate.colonies, input));
    if (estimate.newPlanets) {
      options.push(newPlanetCard(estimate.newPlanets, input));
    }
    if (options.length > 0) cards.push(options.sort(better)[0]);
  }
  cards.sort(better);
  return {
    recommended: cards.filter((card) => card.verdict === 'beats'),
    others: cards.filter((card) => card.verdict !== 'beats'),
  };
}
