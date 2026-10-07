/**
 * The whole-account plan's feature layer: which products are worth a solver
 * search, and the plan shaped for the panel. The split itself is
 * `src/engine/pi/accountPlan.ts`.
 *
 * Each candidate costs a solver search per colony set, so the list is short:
 * the best-selling few of each tier from P2 up that the pilot's colonies can
 * host. Tier-diverse on purpose, since a price-only list would be all P4.
 */
import type { PiData } from '@/sde/types';
import { piTier } from '@/engine/pi/chain';
import type { AccountGroup, AccountPlan } from '@/engine/pi/accountPlan';
import type { PlannerColony, PlanetType } from '@/engine/pi/goalTypes';
import { chainHostTypes } from './chainEstimateModel';
import { rawInputsOf } from './productPlanets';

/** Products tried per tier (P2, P3, P4). */
const CANDIDATES_PER_TIER = 4;

/**
 * P2, P3 and P4 the colonies could make, best price first within each tier. Without
 * a tier to buy, every raw must come from one of the colonies; with one, a
 * colony can host a product from bought inputs, so only the host type matters.
 */
export function accountCandidates(
  colonies: readonly PlannerColony[],
  pi: PiData,
  prices: Readonly<Record<number, number>>,
  buying: boolean
): number[] {
  if (colonies.length === 0) return [];
  const yielded = new Set(colonies.flatMap((colony) => [...colony.ratePerEcu.keys()]));
  const types = [...new Set(colonies.map((colony) => colony.planetType))] as PlanetType[];
  const byTier = new Map<number, number[]>();
  for (const key of Object.keys(pi.schematics)) {
    const typeId = Number(key);
    const tier = piTier(typeId, pi);
    if (tier < 2 || prices[typeId] === undefined) continue;
    if (chainHostTypes(typeId, pi, types).length === 0) continue;
    if (!buying && !rawInputsOf(typeId, pi).every((raw) => yielded.has(raw))) continue;
    byTier.set(tier, [...(byTier.get(tier) ?? []), typeId]);
  }
  return [...byTier.values()].flatMap((ids) =>
    ids.sort((a, b) => prices[b] - prices[a] || a - b).slice(0, CANDIDATES_PER_TIER)
  );
}

/** A group that changes what its colonies do: it makes a product. */
export type AccountChange = AccountGroup & { typeId: number };

export interface AccountView {
  /** Groups that make a product, biggest gain first. The engine takes none without a gain. */
  changes: AccountChange[];
  /** Colonies left on their own best pick. */
  stays: AccountGroup[];
  totalPerDay: number;
  apartTotalPerDay: number;
  buyGainPerDay: number;
  haulGainPerDay: number;
  /** Colonies with no one-planet figure: left out of the plan and the totals. */
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
