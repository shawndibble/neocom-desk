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
 * **What if I add a planet?** One or several planet types the pilot does not
 * run (Plan: one at a time; the Map: whatever is ticked, priced as one set):
 * the chains they would make possible, in the same two layouts with those
 * types added. On their colonies, each is a new planet beside them
 * (`whatIfPlanetId`, no distance known yet); on new planets, the chain must
 * use at least one of the added types. Either way every added planet takes a
 * free slot, and each is compared with a free slot at the best one-planet
 * recipe. Never recommended: these are facts about planets they do not have.
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
  newPlanetColony,
  type ChainBasis,
  type ChainEstimateView,
} from './chainEstimateModel';
import type { PlanAdvice } from './planAdviceModel';
import { rawInputsOf } from './productPlanets';
import { localResourcesFor } from './systemPlanetModel';

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
  return candidatesFor(yielded, types, pi);
}

function candidatesFor(
  yielded: ReadonlySet<number>,
  types: readonly PlanetType[],
  pi: PiData
): number[] {
  return chainProductIds(pi).filter((typeId) => {
    if (!rawInputsOf(typeId, pi).every((raw) => yielded.has(raw))) return false;
    return chainHostTypes(typeId, pi, types).length > 0;
  });
}

/** The planet id the first what-if planet takes beside the pilot's colonies: no real planet's id is negative. */
export const WHAT_IF_PLANET_ID = -1;

/** The id of the `index`th what-if planet (0-based): -1, -2, … */
export const whatIfPlanetId = (index: number) => -(index + 1);

export const isWhatIfPlanetId = (id: number) => id < 0;

/** A set of what-if types as one cache key: sorted, so a single type is its own key. */
export function whatIfKey(types: PlanetType | readonly PlanetType[]): string {
  return typeof types === 'string' ? types : [...new Set(types)].sort().join('+');
}

/** The types a `whatIfKey` names, sorted: the order their planet ids are given in. */
export function whatIfTypesOf(key: string): PlanetType[] {
  return key === '' ? [] : (key.split('+') as PlanetType[]);
}

const rawsOn = (type: PlanetType, pi: PiData) =>
  localResourcesFor(type, pi).map((raw) => raw.typeID);

/** The P3s and P4s planets of `types` would add: buildable with them, not without. A type they run adds nothing. */
export function whatIfChainCandidates(
  colonies: readonly PlannerColony[],
  types: readonly PlanetType[],
  pi: PiData
): number[] {
  const owned = new Set(colonies.map((colony) => colony.planetType));
  const added = [...new Set(types)].filter((type) => !owned.has(type));
  if (colonies.length === 0 || added.length === 0) return [];
  const base = new Set(biggerChainCandidates(colonies, pi));
  const yielded = new Set([
    ...colonies.flatMap((colony) => [...colony.ratePerEcu.keys()]),
    ...added.flatMap((type) => rawsOn(type, pi)),
  ]);
  return candidatesFor(yielded, [...owned, ...added], pi).filter((typeId) => !base.has(typeId));
}

/**
 * The chain on the pilot's colonies plus one new planet of each of `types` (at
 * the ranking's assumptions, no distance known), or null: not a free slot for
 * each, no figure, or a plan that leaves every new planet out.
 */
export function estimateOnColoniesWith(
  typeId: number,
  types: readonly PlanetType[],
  colonies: readonly PlannerColony[],
  freeSlots: number,
  basis: ChainBasis,
  jumps: JumpsFn | undefined,
  pi: PiData
): ColonyChainEstimate | null {
  if (types.length === 0 || freeSlots < types.length) return null;
  const added = types.map((type, index) =>
    newPlanetColony(whatIfPlanetId(index), type, rawsOn(type, pi), basis)
  );
  // A new planet has no system yet: every route to it is unknown, never zero.
  const withUnknown: JumpsFn | undefined = jumps
    ? (from, to) =>
        isWhatIfPlanetId(from) || (to !== 'hub' && isWhatIfPlanetId(to)) ? null : jumps(from, to)
    : undefined;
  const result = estimateOnColonies(typeId, [...colonies, ...added], basis, withUnknown, pi);
  return result?.planetIds.some(isWhatIfPlanetId) ? result : null;
}

/** The chain on new planets of the pilot's types and `added`, or null: it fits no free slots for all of them, or leaves every one out. */
export function estimateOnNewPlanetsWith(
  typeId: number,
  added: readonly PlanetType[],
  types: readonly PlanetType[],
  freeSlots: number,
  basis: ChainBasis,
  pi: PiData
): ChainEstimateView | null {
  if (added.length === 0 || freeSlots < added.length) return null;
  const view = estimateOnNewPlanets(typeId, [...types, ...added], freeSlots, basis, pi);
  return view?.planets.some((type) => added.includes(type)) ? view : null;
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

/** The planets a card's chain uses, the new ones included. */
export function cardPlanetCount(card: BiggerChainCard): number {
  return card.kind === 'colonies' ? card.planetIds.length : card.estimate.planets.length;
}

export interface WhatIfChainsRow {
  /** `whatIfKey` of the planet types added. */
  key: string;
  /** The planet types added, sorted: the order their planet ids are given in. */
  types: PlanetType[];
  /** Every chain it makes possible with a figure, best first. */
  cards: BiggerChainCard[];
}

/** `whatIfChainsView` over Plan's own figures: the same comparison on Plan and the Map. */
export function whatIfChainsOf(
  advice: Pick<PlanAdvice, 'colonies' | 'slots' | 'chainBasis'>,
  byType: ReadonlyMap<string, ReadonlyMap<number, BiggerChainEstimates>>
): WhatIfChainsRow[] {
  return whatIfChainsView({
    byType,
    afterRebuildPerDay: new Map(
      advice.colonies.map((colony) => [colony.planetId, colony.afterRebuildPerDay])
    ),
    slots: { free: advice.slots.free, gainPerPlanetPerDay: advice.slots.gainPerPlanetPerDay },
    haulDays: advice.chainBasis.haulDays,
  });
}

/**
 * One row per set of planet types (a `whatIfKey`) that makes a chain possible,
 * the set whose best chain gains most first. Each new planet is compared with a
 * free slot at the best one-planet recipe, as a chain on new planets is.
 */
export function whatIfChainsView(
  input: Omit<BiggerChainsInput, 'estimates'> & {
    byType: ReadonlyMap<string, ReadonlyMap<number, BiggerChainEstimates>>;
  }
): WhatIfChainsRow[] {
  const rows: WhatIfChainsRow[] = [];
  for (const [key, estimates] of input.byType) {
    const types = whatIfTypesOf(key);
    const afterRebuildPerDay = new Map(input.afterRebuildPerDay);
    types.forEach((_, index) =>
      afterRebuildPerDay.set(whatIfPlanetId(index), input.slots.gainPerPlanetPerDay)
    );
    const view = biggerChainsView({ ...input, estimates, afterRebuildPerDay });
    const cards = [...view.recommended, ...view.others];
    if (cards.length > 0) rows.push({ key, types, cards });
  }
  return rows.sort((a, b) => better(a.cards[0], b.cards[0]) || a.key.localeCompare(b.key));
}
