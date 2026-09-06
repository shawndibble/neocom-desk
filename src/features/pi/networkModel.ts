/**
 * The Advisor's colony set, in the terms `engine/pi/network.ts` takes
 * (ADR 0012).
 *
 * The engine is pure and knows nothing about ESI: it wants each colony's
 * measured output, its free CPU/Powergrid and what a link there costs. This
 * is where a `PlanetAdvice[]` becomes that, and the one place it happens.
 */

import type { PiData } from '@/sde/types';
import {
  planNetwork,
  type ConvertibleFacility,
  type NetworkColony,
  type NetworkPlan,
} from '@/engine/pi/network';
import { CUSTOMS_TAXABLE_VALUE, piTier } from '@/engine/pi/chain';
import type { FactoryBalance } from '@/engine/pi/factoryBalance';
import type { PlanetAdvice } from './advisorModel';

/** Schematic cycle times are in seconds. */
const SECONDS_PER_HOUR = 3_600;
import { colonyFactoryBalance, colonyOutputPerHour, surplusLoad } from './factoryBalanceModel';

export interface NetworkModelInput {
  advice: readonly PlanetAdvice[];
  pi: PiData;
  prices: Readonly<Record<number, number>>;
  /** What a sale fetches — highest hub buy, falling back to the ask. */
  revenuePrices?: Readonly<Record<number, number>>;
  /**
   * May a plan assume inputs can be bought at a hub? The caller decides, and
   * the pilot's default is off — see `marketSourcingPref.ts`.
   */
  allowMarketSourcing?: boolean;
  /**
   * Each colony's own customs rate, by planetId, for a set spanning more than
   * one system. Absent planets fall back to `taxRate`.
   *
   * Only the host's rate ever enters a chain's cost, so a cross-system plan
   * needs no second tax model — just the right rate per candidate host. See
   * `NetworkColony.taxRate`.
   */
  taxRateByPlanet?: ReadonlyMap<number, number>;
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
/**
 * What one fed factory of a schematic earns an hour, and how many of them there
 * are — the price of taking one down.
 *
 * Revenue and the material it consumes are both valued on the bid: the output
 * is sold, and the input is material this colony already has, so consuming it
 * costs the sale forgone. The customs office is charged on the *difference*,
 * because the P0 leaves the planet either way — as ore if the factory goes, as
 * P1 if it stays — and only the tier it leaves at changes.
 *
 * Only fed pins are counted. A starved one makes nothing, so it has no margin
 * to give up, and `idleFacilityPlan` already offers it for removal — counting
 * it here would offer the same pin twice under two different reasons.
 */
function convertibleFacilities(
  balance: readonly FactoryBalance[],
  pi: PiData,
  revenuePrices: Readonly<Record<number, number>>,
  taxRate: number
): ConvertibleFacility[] {
  const out: ConvertibleFacility[] = [];
  for (const line of balance) {
    if (line.status !== 'measured' || line.fedPins < 1) continue;
    const schematic = pi.schematics[String(line.typeId)];
    if (!schematic) continue;
    const perHour = SECONDS_PER_HOUR / schematic.cycleTime;
    const outputPerHour = schematic.quantity * perHour;
    const price = revenuePrices[line.typeId];
    if (price == null || !Number.isFinite(price)) continue;

    let inputCost = 0;
    let inputTaxable = 0;
    let priced = true;
    for (const input of schematic.inputs) {
      const unit = revenuePrices[input.typeID];
      if (unit == null || !Number.isFinite(unit)) {
        priced = false;
        break;
      }
      const units = input.quantity * perHour;
      inputCost += units * unit;
      inputTaxable += units * CUSTOMS_TAXABLE_VALUE[piTier(input.typeID, pi)];
    }
    if (!priced) continue;

    const taxDelta =
      taxRate * (outputPerHour * CUSTOMS_TAXABLE_VALUE[piTier(line.typeId, pi)] - inputTaxable);
    out.push({
      facility: line.facility,
      count: line.fedPins,
      marginPerHour: outputPerHour * price - inputCost - taxDelta,
      outputTypeId: line.typeId,
      outputPerHour,
    });
  }
  return out;
}

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
      ...(input.taxRateByPlanet?.has(entry.planetId)
        ? { taxRate: input.taxRateByPlanet.get(entry.planetId) as number }
        : {}),
      // What is already running here, and what it is worth — so the plan can
      // weigh keeping it against what its budget would hold instead.
      convertible: convertibleFacilities(
        balance,
        input.pi,
        input.revenuePrices ?? input.prices,
        input.taxRate
      ),
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
        ...(input.revenuePrices ? { revenuePrices: input.revenuePrices } : {}),
        // The pilot's own switch, off by default: buying P1 to feed a factory
        // assumes a hub you can reach, which is not everyone's situation.
        // Routing between the pilot's *own* colonies is never gated by it —
        // that is the case this surface exists to find.
        allowMarketSourcing: input.allowMarketSourcing ?? false,
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
