/**
 * A snapshot's colonies, turned into the worklist's own shape.
 *
 * `worklistModel.ts` is deliberately ignorant of `BuiltColonyAdvice`, ESI pins
 * and the network plan — it ranks and pairs, and that is all, so it can be
 * tested on plain objects. This is the seam that feeds it, the same role
 * `factoryBalanceModel.ts` plays for `engine/pi/factoryBalance.ts`.
 *
 * Every refusal the underlying models make is preserved here rather than
 * flattened into a default. A colony whose extraction cannot be measured
 * contributes no overflow warning (not a passing one), a colony whose links
 * cannot be costed contributes no rebuild advice, and a stop-tier
 * recommendation the colony is already running contributes nothing at all —
 * telling a pilot to build what they have built is the failure
 * `alreadyRunning` exists to catch.
 */
import type { PlanetPin } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import type { NetworkConversion, NetworkOpportunity } from '@/engine/pi/network';
import type { PlanetAdvice } from './advisorModel';
import { colonyPlan } from './colonyPlan';
import { colonyStopTierAdvice } from './stopTierModel';
import { colonyThroughputCheck } from './colonyThroughput';
import type { WorklistColony, WorklistIdle, WorklistThroughput } from './worklistModel';

export interface WorklistAdapterInput {
  /** This system's planets, as `systemAdvice` returned them. */
  advice: readonly PlanetAdvice[];
  /** Raw ESI pins by planet id — the peak extraction rate needs the install-time baseline. */
  pinsByPlanet: ReadonlyMap<number, readonly PlanetPin[]>;
  pi: PiData;
  prices: Readonly<Record<number, number>>;
  revenuePrices: Readonly<Record<number, number>>;
  taxRate: number;
  /** The pilot's own haul window, in hours — see `cadencePref.ts`. */
  haulHours: number;
  opportunitiesByHost: ReadonlyMap<number, readonly NetworkOpportunity[]>;
  conversionsByHost: ReadonlyMap<number, readonly NetworkConversion[]>;
  /** Resource names by typeID, for the extraction a removal pays for. */
  typeNames: ReadonlyMap<number, string>;
}

/**
 * What pulling this colony's idle facilities frees, and the extraction that
 * budget buys.
 *
 * `needs-removal` is the only status that becomes an `enables`: it means the
 * extraction fits *once the idle pins are gone*, which is exactly the pairing
 * the worklist renders. `fits` means it fits without removing anything, so the
 * two are not one instruction and the removal stands alone.
 */
function idleOf(
  plan: ReturnType<typeof colonyPlan>,
  typeNames: ReadonlyMap<number, string>
): WorklistIdle | null {
  const { idle } = plan;
  if (!idle || idle.lines.length === 0) return null;

  const pinCount = idle.lines.reduce((sum, line) => sum + line.line.surplusPins, 0);
  const freed = idle.lines.reduce(
    (load, line) => ({
      cpu: load.cpu + line.freed.cpu,
      powergrid: load.powergrid + line.freed.powergrid,
    }),
    { cpu: 0, powergrid: 0 }
  );

  const { upgrade, wouldFeed } = idle;
  // The resource the binding shortfall is in — the one the heads would pull.
  const shortfall = idle.lines.find((line) => line.gap !== null)?.gap ?? null;
  const enables =
    upgrade.status === 'needs-removal' && upgrade.heads > 0 && shortfall !== null
      ? {
          heads: upgrade.heads,
          unitsPerHour: upgrade.extraPerHour,
          resource: typeNames.get(shortfall.typeId) ?? shortfall.name,
          wouldFeed,
        }
      : null;

  return { pinCount, freed, enables };
}

/**
 * How long this colony lasts before it fills, measured at a fresh program's
 * peak rather than its whole-program mean.
 *
 * The peak is the honest figure for a buffer question: a program fills a
 * Launchpad fastest on its first day, and a check at the mean passes layouts
 * that stall immediately (#958). `lostIskPerHour` is left at zero — what
 * standing still costs depends on earnings this adapter is not given, and a
 * fabricated figure would rank the row on a number nobody derived. The row
 * still leads the list, because its band does that, not its value.
 */
function throughputOf(
  colony: Extract<PlanetAdvice, { kind: 'built' }>['colony'],
  pins: readonly PlanetPin[],
  pi: PiData,
  haulHours: number
): WorklistThroughput | null {
  if (colony.extractedPerHour.length === 0) return null;
  const check = colonyThroughputCheck({
    colony,
    pins,
    pi,
    // Never guessed — CONTEXT.md round 51. The buffer half is what this row
    // is about, and it is answered.
    linkCapacityPerHour: null,
    bufferHours: haulHours,
  });
  return { hoursToFull: check.peak.hoursToFull, haulHours, lostIskPerHour: 0 };
}

export function worklistColonies(input: WorklistAdapterInput): WorklistColony[] {
  const { advice, pinsByPlanet, pi, prices, revenuePrices, taxRate, haulHours, typeNames } = input;

  return advice
    .filter((entry): entry is Extract<PlanetAdvice, { kind: 'built' }> => entry.kind === 'built')
    .map((entry) => {
      const { colony, planetId } = entry;
      const pins = pinsByPlanet.get(planetId) ?? [];
      const plan = colonyPlan(colony, pi);

      const stopTier = colonyStopTierAdvice({
        colony,
        planetType: entry.planetType,
        pi,
        prices,
        revenuePrices,
        taxRate,
        bufferHours: haulHours,
      });
      // Only a recommendation the colony is not already running is a step. A
      // refusal is not a step either — it belongs in the "cannot see" panel,
      // which reads the same advice for itself.
      const rebuild =
        stopTier.status === 'advised' &&
        stopTier.advice.kind === 'recommended' &&
        !stopTier.alreadyRunning
          ? {
              label: stopTier.advice.best.name,
              tier: stopTier.advice.best.tier,
              marginPerHour: stopTier.advice.best.marginPerHour,
              pins: stopTier.advice.best.pins,
            }
          : null;

      return {
        planetId,
        name: entry.name,
        planetType: entry.planetType,
        idle: idleOf(plan, typeNames),
        opportunities: (input.opportunitiesByHost.get(planetId) ?? []).map((line) => ({
          label: line.name,
          marginPerHour: line.marginPerHour,
        })),
        conversions: (input.conversionsByHost.get(planetId) ?? []).map((entryLine) => ({
          label: entryLine.add.name,
          // The exchange's own worth, not the replacement's: what is added
          // less what is given up. Ranking on the gross would put a swap that
          // barely improves on the colony above a plain addition that clearly does.
          marginPerHour: entryLine.netPerHour,
        })),
        rebuild,
        throughput: throughputOf(colony, pins, pi, haulHours),
      };
    });
}
