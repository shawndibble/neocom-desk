import type { PiData } from '@/sde/types';
import {
  planNetwork,
  type ConvertibleFacility,
  type NetworkColony,
  type NetworkPlan,
} from '@/engine/pi/network';
import { CUSTOMS_TAXABLE_VALUE, piTier } from '@/engine/pi/chain';
import type { FactoryBalance } from '@/engine/pi/factoryBalance';
import { hostRateFor } from './customsRate';
import type { PlanetAdvice } from './systemPlanetModel';

const SECONDS_PER_HOUR = 3_600;
import { colonyExportablePerHour, colonyFactoryBalance, surplusLoad } from './factoryBalanceModel';

export interface NetworkModelInput {
  advice: readonly PlanetAdvice[];
  pi: PiData;
  prices: Readonly<Record<number, number>>;
  revenuePrices?: Readonly<Record<number, number>>;
  allowMarketSourcing?: boolean;
  taxRateByPlanet?: ReadonlyMap<number, number>;
  taxRate: number;
  salesTaxPct: number;
}

function convertibleFacilities(
  balance: readonly FactoryBalance[],
  pi: PiData,
  revenuePrices: Readonly<Record<number, number>>,
  taxRate: number,
  salesTaxPct: number
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
    const netPrice = price * (1 - salesTaxPct / 100);

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
      marginPerHour: outputPerHour * netPrice - inputCost - taxDelta,
      outputTypeId: line.typeId,
      outputPerHour,
    });
  }
  return out;
}

function buildNetworkColonies(input: NetworkModelInput): {
  colonies: NetworkColony[];
  assumesRemoval: boolean;
} {
  const colonies: NetworkColony[] = [];
  let assumesRemoval = false;
  for (const entry of input.advice) {
    if (entry.kind !== 'built') continue;
    const { colony } = entry;
    if (!colony.detailLoaded) continue;

    const balance = colonyFactoryBalance(colony, input.pi);
    const freed = surplusLoad(balance, input.pi);
    if (freed.cpu > 0 || freed.powergrid > 0) assumesRemoval = true;
    if (colony.linkCount > 0 && colony.pinLoad.linkLoad === null) continue;

    const hostTaxRate = hostRateFor(entry.planetId, input.taxRateByPlanet, input.taxRate);
    colonies.push({
      planetId: entry.planetId,
      exportablePerHour: colonyExportablePerHour(balance, input.pi),
      spare: {
        cpu: Math.max(0, colony.budget.cpu - colony.pinLoad.load.cpu) + freed.cpu,
        powergrid:
          Math.max(0, colony.budget.powergrid - colony.pinLoad.load.powergrid) + freed.powergrid,
      },
      newLinkCost: colony.pinLoad.newLinkLoad,
      ...(input.taxRateByPlanet?.has(entry.planetId) ? { taxRate: hostTaxRate } : {}),
      convertible: convertibleFacilities(
        balance,
        input.pi,
        input.revenuePrices ?? input.prices,
        hostTaxRate,
        input.salesTaxPct
      ),
    });
  }
  return { colonies, assumesRemoval };
}

export function networkColonies(input: NetworkModelInput): NetworkColony[] {
  return buildNetworkColonies(input).colonies;
}

export interface ColonyNetwork {
  plan: NetworkPlan;
  assumesRemoval: boolean;
}

export function colonyNetwork(input: NetworkModelInput): ColonyNetwork | null {
  const { colonies, assumesRemoval } = buildNetworkColonies(input);
  if (colonies.length < 2) return null;
  return {
    plan: planNetwork(
      {
        colonies,
        infrastructure: input.pi.infrastructure,
        prices: input.prices,
        ...(input.revenuePrices ? { revenuePrices: input.revenuePrices } : {}),
        allowMarketSourcing: input.allowMarketSourcing ?? false,
        taxRate: input.taxRate,
        salesTaxPct: input.salesTaxPct,
      },
      input.pi
    ),
    assumesRemoval,
  };
}
