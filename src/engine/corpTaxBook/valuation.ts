/**
 * Valuation (D11) is the personal Moon Mining Tax tab's engine, so a member
 * and their corp see the same amount due: the same Ore Form mapping
 * (`oreFormTypeId`), the same saved-snapshot merge (`mergeSnapshotDay`), the
 * same saved → historical → live buy → live sell chain (`resolveTaxUnitPrice`)
 * and the same Σ quantity × price × pct (`computeAssignmentValue`). What the
 * book brings is its own trade hub and Ore Form, which the caller loads the
 * prices for; this module never fetches.
 */
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
  /** SDE raw → Compressed type ids. */
  compressedByRaw: Readonly<Record<string, number>>;
  /** The book's Ore Form: Compressed (default) or Raw. */
  compressed: boolean;
}

/** One day's price inputs at the book's hub, keyed by the type actually priced (the Ore Form type). */
export interface DayPriceInputs {
  ore: OreFormSetting;
  /**
   * Saved snapshots for the day, lowest priority first — the personal tab
   * passes the per-browser snapshot, then the server's 6h snapshot, so the
   * server wins for a type both priced.
   */
  saved: readonly SnapshotDay[];
  historical?: SnapshotDay;
  /** Today's live book. */
  live?: SnapshotDay;
}

/** The same shape as the personal tab's `UnitPrices`, keyed by raw type id. */
export interface DayPrices {
  /** Per-unit price by raw type id; 0 when unpriced. */
  prices: Map<number, number>;
  sources: Map<number, TaxPriceSource>;
  /** Raw types with no usable price that day. */
  unpriced: Set<number>;
  /** Raw types valued at today's live sell for want of any buy side. */
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

/** One Observed Mining Entry's value and tax, at its day's prices (by raw type id) and rate. */
export function valueObservedEntry(
  entry: ObservedMiningEntry,
  prices: ReadonlyMap<number, number>,
  taxPct: number
): AssignmentValue {
  return computeAssignmentValue(entry.oreLines, prices, taxPct);
}
