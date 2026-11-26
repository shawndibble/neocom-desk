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

export interface ChainLeg {
  from: number;
  to: number;
  jumps: number | null;
}

export interface ColonyChainEstimate {
  typeId: number;
  iskPerDay: number;
  unitsPerDay: number;
  planetIds: number[];
  hostId: number;
  m3PerWeek: number;
  legs: ChainLeg[];
}

export interface BiggerChainEstimates {
  colonies: ColonyChainEstimate | null;
  newPlanets: ChainEstimateView | null;
}

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

export const WHAT_IF_PLANET_ID = -1;

export const whatIfPlanetId = (index: number) => -(index + 1);

export const isWhatIfPlanetId = (id: number) => id < 0;

export function whatIfKey(types: PlanetType | readonly PlanetType[]): string {
  return typeof types === 'string' ? types : [...new Set(types)].sort().join('+');
}

export function whatIfTypesOf(key: string): PlanetType[] {
  return key === '' ? [] : (key.split('+') as PlanetType[]);
}

const rawsOn = (type: PlanetType, pi: PiData) =>
  localResourcesFor(type, pi).map((raw) => raw.typeID);

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
  const withUnknown: JumpsFn | undefined = jumps
    ? (from, to) =>
        isWhatIfPlanetId(from) || (to !== 'hub' && isWhatIfPlanetId(to)) ? null : jumps(from, to)
    : undefined;
  const result = estimateOnColonies(typeId, [...colonies, ...added], basis, withUnknown, pi);
  return result?.planetIds.some(isWhatIfPlanetId) ? result : null;
}

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
  m3PerHaul: number;
  versusPerDay: number | null;
  gainPerDay: number | null;
  verdict: BiggerChainVerdict;
}

export type BiggerChainCard =
  | (CardBase & { kind: 'colonies'; planetIds: number[]; hostId: number; legs: ChainLeg[] })
  | (CardBase & { kind: 'new-planets'; estimate: ChainEstimateView });

export interface BiggerChainsView {
  recommended: BiggerChainCard[];
  others: BiggerChainCard[];
}

export interface BiggerChainsInput {
  estimates: ReadonlyMap<number, BiggerChainEstimates>;
  afterRebuildPerDay: ReadonlyMap<number, number | null>;
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

function better(a: BiggerChainCard, b: BiggerChainCard): number {
  return (
    RANK[a.verdict] - RANK[b.verdict] ||
    (b.gainPerDay ?? -Infinity) - (a.gainPerDay ?? -Infinity) ||
    b.iskPerDay - a.iskPerDay ||
    a.typeId - b.typeId
  );
}

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

export function cardPlanetCount(card: BiggerChainCard): number {
  return card.kind === 'colonies' ? card.planetIds.length : card.estimate.planets.length;
}

export interface WhatIfChainsRow {
  key: string;
  types: PlanetType[];
  cards: BiggerChainCard[];
}

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
