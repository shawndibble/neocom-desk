import type { PiData } from '@/sde/types';
import { piTier } from '@/engine/pi/chain';
import type { AccountGroup, AccountPlan } from '@/engine/pi/accountPlan';
import type { PlannerColony, PlanetType } from '@/engine/pi/goalTypes';
import { salesCapPerDay } from '@/engine/pi/salesCap';
import { chainHostTypes } from './chainEstimateModel';
import { rawInputsOf } from './productPlanets';

const CANDIDATES_PER_TIER = 4;

const REFERENCE_UNITS_PER_DAY: Readonly<Record<number, number>> = { 2: 600, 3: 120, 4: 24 };

function eligibleByTier(
  colonies: readonly PlannerColony[],
  pi: PiData,
  prices: Readonly<Record<number, number>>,
  buying: boolean
): Map<number, number[]> {
  const byTier = new Map<number, number[]>();
  if (colonies.length === 0) return byTier;
  const yielded = new Set(colonies.flatMap((colony) => [...colony.ratePerEcu.keys()]));
  const types = [...new Set(colonies.map((colony) => colony.planetType))] as PlanetType[];
  for (const key of Object.keys(pi.schematics)) {
    const typeId = Number(key);
    const tier = piTier(typeId, pi);
    if (tier < 2 || prices[typeId] === undefined) continue;
    if (chainHostTypes(typeId, pi, types).length === 0) continue;
    if (!buying && !rawInputsOf(typeId, pi).every((raw) => yielded.has(raw))) continue;
    byTier.set(tier, [...(byTier.get(tier) ?? []), typeId]);
  }
  return byTier;
}

export function accountPool(
  colonies: readonly PlannerColony[],
  pi: PiData,
  prices: Readonly<Record<number, number>>,
  buying: boolean
): number[] {
  return [...eligibleByTier(colonies, pi, prices, buying).values()].flat();
}

export function accountCandidates(
  colonies: readonly PlannerColony[],
  pi: PiData,
  prices: Readonly<Record<number, number>>,
  buying: boolean,
  tradesPerDay?: ReadonlyMap<number, number>
): number[] {
  const value = (typeId: number) =>
    prices[typeId] *
    Math.min(
      salesCapPerDay(tradesPerDay?.get(typeId)) ?? Infinity,
      REFERENCE_UNITS_PER_DAY[piTier(typeId, pi)]
    );
  return [...eligibleByTier(colonies, pi, prices, buying).values()].flatMap((ids) =>
    ids.sort((a, b) => value(b) - value(a) || a - b).slice(0, CANDIDATES_PER_TIER)
  );
}

export type AccountChange = AccountGroup & { typeId: number };

export interface AccountView {
  changes: AccountChange[];
  stays: AccountGroup[];
  totalPerDay: number;
  apartTotalPerDay: number;
  buyGainPerDay: number;
  haulGainPerDay: number;
  unknownCount: number;
}

export function accountView(plan: AccountPlan): AccountView {
  const changes: AccountChange[] = [];
  const stays: AccountGroup[] = [];
  for (const group of plan.groups) {
    if (group.typeId === null) stays.push(group);
    else changes.push({ ...group, typeId: group.typeId });
  }
  changes.sort((a, b) => b.gainPerDay - a.gainPerDay || a.planetIds[0] - b.planetIds[0]);
  return {
    changes,
    stays,
    totalPerDay: plan.totalPerDay,
    apartTotalPerDay: plan.apartTotalPerDay,
    buyGainPerDay: plan.buyGainPerDay,
    haulGainPerDay: plan.haulGainPerDay,
    unknownCount: plan.unknownPlanetIds.length,
  };
}
