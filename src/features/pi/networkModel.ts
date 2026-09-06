/**
 * The Advisor's colony set, in the terms `engine/pi/network.ts` takes
 * (ADR 0012).
 *
 * The engine is pure and knows nothing about ESI: it wants each colony's
 * measured output, its free CPU/Powergrid and what a link there costs. This
 * is where a `PlanetAdvice[]` becomes that, and the one place it happens.
 */

import type { PiData } from '@/sde/types';
import { planNetwork, type NetworkColony, type NetworkPlan } from '@/engine/pi/network';
import type { PlanetAdvice } from './advisorModel';
import { colonyFactoryBalance, colonyOutputPerHour, surplusLoad } from './factoryBalanceModel';

export interface NetworkModelInput {
  advice: readonly PlanetAdvice[];
  pi: PiData;
  prices: Readonly<Record<number, number>>;
  taxRate: number;
}

/**
 * Every built colony on screen, measured.
 *
 * A colony whose detail never loaded is left out rather than entered as a
 * colony with no output: an unread colony is not an empty one, and counting it
 * as empty would route material past a planet that is already consuming it.
 * A colony whose links could not be priced is left out for the same reason the
 * card refuses it a headroom figure — there is no honest `spare` for it.
 */
export function networkColonies(input: NetworkModelInput): NetworkColony[] {
  const colonies: NetworkColony[] = [];
  for (const entry of input.advice) {
    if (entry.kind !== 'built') continue;
    const { colony } = entry;
    if (!colony.detailLoaded) continue;
    if (colony.linkCount > 0 && colony.pinLoad.linkLoad === null) continue;

    const balance = colonyFactoryBalance(colony, input.pi);
    // The budget offered to a host includes what its *unfed* factories are
    // holding. That is the join between the two halves of the advice: the
    // pins nothing feeds are the room the new ones go in, and on the reported
    // operation they are the difference between one Advanced factory system-
    // wide and nine. It makes the plan conditional on a removal the pilot has
    // not made yet, so `assumesRemoval` comes back with it and the panel says
    // so — a promise resting on an unstated precondition is the failure this
    // tab exists to avoid.
    const freed = surplusLoad(balance, input.pi);
    colonies.push({
      planetId: entry.planetId,
      outputPerHour: colonyOutputPerHour(balance, input.pi),
      spare: {
        cpu: Math.max(0, colony.budget.cpu - colony.pinLoad.load.cpu) + freed.cpu,
        powergrid:
          Math.max(0, colony.budget.powergrid - colony.pinLoad.load.powergrid) + freed.powergrid,
      },
      newLinkCost: colony.pinLoad.newLinkLoad,
    });
  }
  return colonies;
}

/**
 * What this system's colonies could make together.
 *
 * Null when there is nothing to say — fewer than two measurable colonies, so
 * there is no "together" to answer about. A panel is worth rendering only when
 * it has a colony set; one colony is the per-planet question, already on its
 * own card.
 */
export interface ColonyNetwork {
  plan: NetworkPlan;
  /**
   * True when a host's budget included room its unfed factories are still
   * holding, so the plan needs those removed before any of it can be built.
   */
  assumesRemoval: boolean;
}

export function colonyNetwork(input: NetworkModelInput): ColonyNetwork | null {
  const colonies = networkColonies(input);
  if (colonies.length < 2) return null;
  return {
    plan: planNetwork(
      {
        colonies,
        infrastructure: input.pi.infrastructure,
        prices: input.prices,
        taxRate: input.taxRate,
      },
      input.pi
    ),
    assumesRemoval: assumesRemovalFor(input),
  };
}

/**
 * Whether any colony in this set is holding budget in factories nothing feeds.
 *
 * Recomputed rather than threaded out of `networkColonies`, which returns the
 * engine's own shape and should not grow a field the engine has no use for.
 */
function assumesRemovalFor(input: NetworkModelInput): boolean {
  return input.advice.some((entry) => {
    if (entry.kind !== 'built' || !entry.colony.detailLoaded) return false;
    const freed = surplusLoad(colonyFactoryBalance(entry.colony, input.pi), input.pi);
    return freed.cpu > 0 || freed.powergrid > 0;
  });
}
