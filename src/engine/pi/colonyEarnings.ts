/**
 * A colony's current earnings, in ISK an hour — the baseline the stop-tier and
 * network engines are missing (issue #956).
 *
 * `stopTier.ts` and `network.ts` both answer an *opportunity* question: what a
 * rebuild, or an added factory, would earn. Neither says what the colony
 * already sitting there earns today, so a card reading "+284K/hr available"
 * never states what that is added to. This module answers the other half:
 * price whatever a colony is *actually* putting out, right now, at hub rates.
 *
 * ## The input is the fed rate, already netted — not this module's job
 *
 * `saleableOutputPerHour` is one map, typeID to units/hr, of whatever leaves
 * the planet. Building that map is entirely the caller's problem, and a
 * deliberately hard one: a colony that refines nothing earns on its extracted
 * P0, one that refines earns on its top tier, and the P0 it consumed is not
 * separately credited — crediting both would double-count material that never
 * left the ground. `features/pi/colonyEarningsModel.ts` is where a built
 * colony's own measurements (extraction rates, factory demand, `feedablePins`)
 * become this map. This module stays dumb on purpose: no `factoryBalance`
 * import, no netting logic, so the arithmetic below is checkable against a
 * plain `{ typeId: unitsPerHour }` fixture without any colony at all.
 *
 * ## Revenue and customs mirror `stopTier.ts` exactly, for the same reason
 *
 * `revenuePrices` (the hub's highest buy) is tried first and `prices` (the
 * ask) is the fallback — at the **book** level, not per type. A type present
 * in `prices` but missing from a supplied `revenuePrices` is reported
 * unpriced rather than quietly priced off the other book: mixing a bid figure
 * for most types with an ask figure for one, inside a single total, is a
 * different and dishonest number, not a reasonable fallback.
 *
 * Customs is charged on export only, at `CUSTOMS_TAXABLE_VALUE[tier] *
 * taxRate` per unit — `scoreRawResource`'s asymmetry, inherited rather than
 * re-derived: everything in this map has already left the planet by the time
 * it reaches here, so import-side tax (paid by whoever receives it, if
 * anyone) is not this module's charge to make.
 *
 * ## Two refusals, not two zeros
 *
 * A type the hub quotes no price for goes into `unpriced` and its rate is
 * left out of the sum entirely — never counted as zero, which would quietly
 * understate every colony making something the hub doesn't track. The total
 * over what *is* priced is still returned alongside it: the caller decides
 * whether a partial figure is worth showing at all, the same call
 * `stopTier.ts` leaves to its own caller.
 *
 * A colony with nothing priced to sum — an empty map, or every rate at zero
 * or below — returns `iskPerHour: null`. That is a colony with no measured
 * extraction to project from, not a colony earning nothing; a real, negative
 * total (ore priced under its own customs base, at a high enough tax rate) is
 * a true number and is returned as such rather than clamped to zero.
 *
 * Pure: prices, tax rate and the output map are all parameters. No fetch, no
 * clock, no Dexie.
 */

import type { PiData } from '@/sde/types';
import { CUSTOMS_TAXABLE_VALUE, isP0, piTier } from './chain';
import type { PiTier } from './types';

export interface ColonyEarningsOptions {
  /**
   * Units/hr of each product typeID that leaves this colony, keyed by
   * typeID. Already netted by the caller so a P0 consumed locally is not
   * double-counted against the tier it was refined into. Empty means no
   * measured extraction at all.
   */
  saleableOutputPerHour: ReadonlyMap<number, number>;
  /** ISK per unit by typeID, the ask. A type the hub does not quote is absent, never zero. */
  prices: Readonly<Record<number, number>>;
  /**
   * What the hub actually pays, by typeID — its highest buy. Defaults to
   * `prices` at the whole-book level; see the module header for why a type
   * missing from this book falls back to nothing rather than to `prices`.
   */
  revenuePrices?: Readonly<Record<number, number>>;
  taxRate: number;
}

export interface ColonyEarnings {
  /** ISK/hr this colony's priced output nets after export customs. Null when nothing here has a figure to project from. */
  iskPerHour: number | null;
  /** TypeIDs the hub does not quote (in the book actually used) — excluded from the sum, not counted as zero. */
  unpriced: number[];
}

/**
 * `isP0` first because a P0 typeID need not appear as a schematic key at all,
 * and `piTier` throws on anything it does not recognize as either — a
 * typeID this module has never heard of is exactly as unpriceable as one the
 * hub quotes no number for, so it is reported the same way rather than
 * crashing the card.
 */
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
  const { saleableOutputPerHour, prices, taxRate } = opts;
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

    const marginPerUnit = price - taxRate * CUSTOMS_TAXABLE_VALUE[tier];
    total += unitsPerHour * marginPerUnit;
    havePriced = true;
  }

  return { iskPerHour: havePriced ? total : null, unpriced };
}
