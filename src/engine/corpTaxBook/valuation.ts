import { oreFormTypeId } from '../miningTax/oreForm';
import {
  mergeSnapshotDay,
  resolveTaxUnitPrice,
  type SnapshotDay,
  type TaxPriceSource,
} from '../miningTax/priceBasis';
import { computeAssignmentValue, type AssignmentValue } from '../miningTax/valuation';
import type { ObservedMiningEntry } from './types';

export interface OreFormSetting {
  compressedByRaw: Readonly<Record<string, number>>;
  compressed: boolean;
}

export interface DayPriceInputs {
  ore: OreFormSetting;
  saved: readonly SnapshotDay[];
  historical?: SnapshotDay;
  live?: SnapshotDay;
}

export interface DayPrices {
  prices: Map<number, number>;
  sources: Map<number, TaxPriceSource>;
  unpriced: Set<number>;
  sellFallback: Set<number>;
}

export function priceObservedDay(rawTypeIds: readonly number[], inputs: DayPriceInputs): DayPrices {
  const saved = inputs.saved.length
    ? inputs.saved.reduce((merged, layer) => mergeSnapshotDay(merged, layer), {} as SnapshotDay)
    : undefined;
  const day: DayPrices = {
    prices: new Map(),
    sources: new Map(),
    unpriced: new Set(),
    sellFallback: new Set(),
  };
  for (const typeId of new Set(rawTypeIds)) {
    const priced = oreFormTypeId(typeId, inputs.ore.compressedByRaw, inputs.ore.compressed);
    const resolved = resolveTaxUnitPrice({
      saved: saved?.[priced],
      historical: inputs.historical?.[priced],
      live: inputs.live?.[priced],
    });
    const price = resolved.price ?? 0;
    day.prices.set(typeId, price);
    day.sources.set(typeId, resolved.source);
    if (resolved.source === 'live-sell') day.sellFallback.add(typeId);
    if (price <= 0) day.unpriced.add(typeId);
  }
  return day;
}

export function moonOwnerUnitPrice(
  side: { buy?: number | null; sell?: number | null } | undefined,
  billed?: number
): number {
  if (side?.buy != null && side.buy > 0) return side.buy;
  if (side?.sell != null && side.sell > 0) return side.sell;
  if (billed !== undefined && billed > 0) return billed;
  return 0;
}

export function moonOwnerDayPrices(
  own: ReadonlyMap<number, number>,
  billed: ReadonlyMap<number, number>
): Map<number, number> {
  const out = new Map(own);
  for (const [typeId, price] of billed) {
    if (!((out.get(typeId) ?? 0) > 0)) out.set(typeId, price > 0 ? price : 0);
  }
  return out;
}

export function valueObservedEntry(
  entry: ObservedMiningEntry,
  prices: ReadonlyMap<number, number>,
  taxPct: number
): AssignmentValue {
  return computeAssignmentValue(entry.oreLines, prices, taxPct);
}
