import type { PiData } from '@/sde/types';
import { CUSTOMS_TAXABLE_VALUE, isP0, piTier } from './chain';
import type { PiTier } from './types';

export interface ColonyEarningsOptions {
  saleableOutputPerHour: ReadonlyMap<number, number>;
  prices: Readonly<Record<number, number>>;
  revenuePrices?: Readonly<Record<number, number>>;
  taxRate: number;
  salesTaxPct: number;
}

export interface ColonyEarnings {
  iskPerHour: number | null;
  unpriced: number[];
}

function tierOf(typeId: number, pi: PiData): PiTier | null {
  if (isP0(typeId, pi)) return 0;
  if (!pi.schematics[String(typeId)]) return null;
  try {
    return piTier(typeId, pi);
  } catch {
    return null;
  }
}

export function colonyEarnings(opts: ColonyEarningsOptions, pi: PiData): ColonyEarnings {
  const { saleableOutputPerHour, prices, taxRate, salesTaxPct } = opts;
  const revenueBook = opts.revenuePrices ?? prices;

  const unpriced: number[] = [];
  let total = 0;
  let havePriced = false;

  for (const [typeId, unitsPerHour] of saleableOutputPerHour) {
    if (!Number.isFinite(unitsPerHour) || unitsPerHour <= 0) continue;

    const price = revenueBook[typeId];
    if (price == null || !Number.isFinite(price)) {
      unpriced.push(typeId);
      continue;
    }

    const tier = tierOf(typeId, pi);
    if (tier === null) {
      unpriced.push(typeId);
      continue;
    }

    const netPrice = price * (1 - salesTaxPct / 100);
    const marginPerUnit = netPrice - taxRate * CUSTOMS_TAXABLE_VALUE[tier];
    total += unitsPerHour * marginPerUnit;
    havePriced = true;
  }

  return { iskPerHour: havePriced ? total : null, unpriced };
}
