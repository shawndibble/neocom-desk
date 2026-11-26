import type { PiData } from '@/sde/types';
import type { FactoryBalance } from '@/engine/pi/factoryBalance';
import { extractionUpgrade, type ExtractionUpgrade } from '@/engine/pi/extractionUpgrade';
import type { PinLoad } from '@/engine/pi/types';
import type { BuiltColonyAdvice } from './systemPlanetModel';

type Measured = Extract<FactoryBalance, { status: 'measured' }>;

export interface StarvedLine {
  line: Measured;
  gap: {
    typeId: number;
    name: string;
    unitsPerHour: number;
    demand: number;
    supply: number;
  } | null;
  freed: PinLoad;
}

export interface IdleFacilityPlan {
  lines: StarvedLine[];
  upgrade: ExtractionUpgrade;
  wouldFeed: number;
  freeAfterRemoval: PinLoad;
}

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

export function idleFacilityPlan(opts: {
  colony: BuiltColonyAdvice;
  balance: readonly FactoryBalance[];
  pi: PiData;
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
