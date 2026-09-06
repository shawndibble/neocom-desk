/**
 * The idle-facility decision, computed — so `ColonyActions.tsx` only renders it.
 *
 * The arithmetic here (which input actually binds, how much extraction closes
 * the gap, how many facilities that feeds, what removal frees) is the same kind
 * of thing `factoryBalanceModel.ts` and `networkModel.ts` do: adapt a colony's
 * measured shape into the pure engine's parameters and hand back a decided
 * answer. It lived in the component for one commit, which put it out of reach
 * of everything but a rendered test — the seam this branch had already
 * established for exactly this reason.
 *
 * Everything genuinely general lives one layer down in
 * `engine/pi/extractionUpgrade.ts`; this is the adapter that knows what a
 * `BuiltColonyAdvice` looks like.
 */
import type { PiData } from '@/sde/types';
import type { FactoryBalance } from '@/engine/pi/factoryBalance';
import { extractionUpgrade, type ExtractionUpgrade } from '@/engine/pi/extractionUpgrade';
import type { PinLoad } from '@/engine/pi/types';
import type { BuiltColonyAdvice } from './advisorModel';

type Measured = Extract<FactoryBalance, { status: 'measured' }>;

export interface StarvedLine {
  line: Measured;
  /** The input it is shortest of, and by how much; null when nothing binds. */
  gap: {
    typeId: number;
    name: string;
    unitsPerHour: number;
    demand: number;
    supply: number;
  } | null;
  /** CPU and Powergrid this line's idle pins are holding. */
  freed: PinLoad;
}

export interface IdleFacilityPlan {
  /** One entry per starved schematic — never summed into a single line. */
  lines: StarvedLine[];
  /** Buying extraction instead of removing. */
  upgrade: ExtractionUpgrade;
  /** Facilities that extraction would feed, capped at the ones actually idle. */
  wouldFeed: number;
  /** What is free once every idle pin is gone — what `upgrade` was sized against. */
  freeAfterRemoval: PinLoad;
}

/**
 * The input a starved schematic is shortest of, and by how much.
 *
 * The binding one, not the first listed: a schematic short of two things is
 * short of one of them worse, and sizing extraction off the wrong one would buy
 * heads that change nothing.
 */
export function shortfallOf(line: Measured): StarvedLine['gap'] {
  const supplyOf = (typeId: number) =>
    line.supplyPerHour.find((entry) => entry.typeId === typeId)?.unitsPerHour ?? 0;
  const binding = line.demandPerHour.reduce(
    (worst, demand) =>
      supplyOf(demand.typeId) / demand.unitsPerHour < supplyOf(worst.typeId) / worst.unitsPerHour
        ? demand
        : worst,
    line.demandPerHour[0]
  );
  if (!binding) return null;
  const supply = supplyOf(binding.typeId);
  const gap = binding.unitsPerHour - supply;
  return gap > 0
    ? {
        typeId: binding.typeId,
        name: binding.name,
        unitsPerHour: gap,
        demand: binding.unitsPerHour,
        supply,
      }
    : null;
}

/**
 * Whether this colony has idle facilities, and what the two ways out of that
 * cost.
 *
 * Returns `null` when nothing is idle — a card with nothing to act on should
 * render no section at all, rather than a reassurance that would bury the cards
 * that do.
 *
 * Extraction is sized only against a *single* starved schematic, for the same
 * reason its head rate is read only off a colony extracting a single resource:
 * with two, "the shortfall" is not one number, and buying to close one of them
 * would be reported as closing both.
 */
export function idleFacilityPlan(opts: {
  colony: BuiltColonyAdvice;
  balance: readonly FactoryBalance[];
  pi: PiData;
  /** CPU and Powergrid free right now. */
  spare: PinLoad;
  newLinkCost: PinLoad | null;
}): IdleFacilityPlan | null {
  const { colony, balance, pi, spare, newLinkCost } = opts;
  const starved = balance.filter(
    (line): line is Measured => line.status === 'measured' && line.surplusPins > 0
  );
  if (starved.length === 0) return null;

  const lines: StarvedLine[] = starved.map((line) => {
    const spec = pi.infrastructure.pins[line.facility];
    return {
      line,
      gap: shortfallOf(line),
      freed: {
        cpu: (spec?.cpu ?? 0) * line.surplusPins,
        powergrid: (spec?.powergrid ?? 0) * line.surplusPins,
      },
    };
  });
  const freed = lines.reduce(
    (sum, entry) => ({
      cpu: sum.cpu + entry.freed.cpu,
      powergrid: sum.powergrid + entry.freed.powergrid,
    }),
    { cpu: 0, powergrid: 0 }
  );
  const freeAfterRemoval = {
    cpu: spare.cpu + freed.cpu,
    powergrid: spare.powergrid + freed.powergrid,
  };

  const only = lines.length === 1 ? lines[0] : null;
  const heads = colony.pinLoad.extractorHeads;
  // Total extraction over head count is this resource's rate per head only when
  // there is one resource; with two it is an average across ores and would size
  // the purchase wrong. No richness figure exists in ESI to derive one from.
  const perHeadPerHour =
    only && colony.extractedPerHour.length === 1 && heads > 0
      ? colony.extractedPerHour[0].unitsPerHour / heads
      : null;

  const upgrade = extractionUpgrade({
    shortfallPerHour: only?.gap?.unitsPerHour ?? 0,
    perHeadPerHour,
    spare,
    newLinkCost,
    infrastructure: pi.infrastructure,
    freedByRemoval: freed,
  });

  // `demandPerHour` is the colony's whole appetite for that input, not one
  // pin's, so dividing by the pins that want it is what turns extraction back
  // into facilities. Read as a per-pin rate it silently reports that a purchase
  // feeds nothing. Measured against the *binding* input, which is the one
  // `upgrade.extraPerHour` is denominated in.
  const bindingDemand = only?.gap
    ? (only.line.demandPerHour.find((entry) => entry.typeId === only.gap?.typeId)?.unitsPerHour ??
      0)
    : 0;
  const perFacility = only && only.line.pins > 0 ? bindingDemand / only.line.pins : 0;
  const wouldFeed =
    perFacility > 0
      ? Math.min(only?.line.surplusPins ?? 0, Math.floor(upgrade.extraPerHour / perFacility))
      : 0;

  return { lines, upgrade, wouldFeed, freeAfterRemoval };
}
