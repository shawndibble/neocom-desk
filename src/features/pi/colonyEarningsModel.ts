import type { PiData } from '@/sde/types';
import { colonyEarnings, type ColonyEarnings } from '@/engine/pi/colonyEarnings';
import type { BuiltColonyAdvice } from './systemPlanetModel';
import {
  colonyFactoryBalance,
  colonyLocalDrawPerHour,
  colonyOutputPerHour,
  netAgainstDraw,
} from './factoryBalanceModel';

export interface ColonyEarningsPrices {
  prices: Readonly<Record<number, number>>;
  revenuePrices?: Readonly<Record<number, number>>;
  taxRate: number;
  salesTaxPct: number;
}

export function saleableOutputPerHour(colony: BuiltColonyAdvice, pi: PiData): Map<number, number> {
  if (colony.extractors.length > 0 && colony.extractedPerHour.length === 0) {
    return new Map();
  }

  const balance = colonyFactoryBalance(colony, pi);

  const produced = new Map<number, number>(
    colony.extractedPerHour.map((line) => [line.typeId, line.unitsPerHour])
  );
  for (const [typeId, unitsPerHour] of colonyOutputPerHour(balance, pi)) {
    produced.set(typeId, (produced.get(typeId) ?? 0) + unitsPerHour);
  }

  const consumedLocally = colonyLocalDrawPerHour(balance, pi);

  return netAgainstDraw(produced, consumedLocally);
}

export function builtColonyEarnings(
  colony: BuiltColonyAdvice,
  pi: PiData,
  priceOpts: ColonyEarningsPrices
): ColonyEarnings {
  const saleable = saleableOutputPerHour(colony, pi);
  return colonyEarnings({ saleableOutputPerHour: saleable, ...priceOpts }, pi);
}

export interface TotalColonyEarnings {
  iskPerHour: number | null;
  unpriced: number[];
  coloniesWithoutFigure: number;
}

export function totalColonyEarnings(perColony: readonly ColonyEarnings[]): TotalColonyEarnings {
  let total = 0;
  let havePriced = false;
  let coloniesWithoutFigure = 0;
  const unpriced = new Set<number>();

  for (const entry of perColony) {
    if (entry.iskPerHour === null) {
      coloniesWithoutFigure += 1;
    } else {
      total += entry.iskPerHour;
      havePriced = true;
    }
    for (const typeId of entry.unpriced) unpriced.add(typeId);
  }

  return {
    iskPerHour: havePriced ? total : null,
    unpriced: [...unpriced],
    coloniesWithoutFigure,
  };
}
