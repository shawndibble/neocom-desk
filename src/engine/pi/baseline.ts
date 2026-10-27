/**
 * The **Baseline**: what each colony earns doing nothing clever — selling the
 * best P1 it can make by itself. Every ISK figure the Goal Plan shows is a
 * **Lift** over this, which is the whole point of the module.
 *
 * The error this exists to prevent is the one a veteran review found in every
 * goal-planner mockup: P0 the pilot extracts priced at zero, so any chain
 * reads as a fat margin when the same planets selling P1 already earned most
 * of it. Measured against the Baseline, a plan that only repackages what the
 * colonies would sell anyway shows a Lift near zero, and one that earns less
 * than leaving them alone says so.
 *
 * ## What "best" is
 *
 * Every extraction option `colonyCapacity.extractionOptions` fits — one P0 at
 * one or two ECUs, or two P0s at one each — scored as
 *
 *     Σ p1PerHour × (bid × (1 − salesTax) − taxRate × CUSTOMS_TAXABLE_VALUE[1])
 *
 * i.e. sold into the hub's buy orders after sales tax, less this colony's own
 * export customs. The bid, because a Baseline is a sale; the ask would credit
 * the pilot the spread. Ties go to the option whose P1 typeIds sort first,
 * then fewer ECUs, so the answer never depends on Map order.
 *
 * ## Refusals, not zeros
 *
 * A P1 any fitting option would sell and the hub does not quote is
 * `needs-price` — never scored at zero, and never quietly skipped while the
 * best of the *priced* options is returned, because the unpriced one may well
 * be the best. A colony where no option fits at all (a Command Center too
 * small for one ECU and its heads) is `nothing-fits`. A colony where every
 * option nets negative (customs above the bid) is `ok` with no slots and
 * zero: the pilot would leave it idle rather than sell at a loss.
 *
 * Pure: prices, colonies and policy are parameters.
 */

import type { PiData } from '@/sde/types';
import { CUSTOMS_TAXABLE_VALUE } from './chain';
import { extractionOptions } from './colonyCapacity';
import type {
  ExtractionSlot,
  HaulEffort,
  JumpsFn,
  PlannerColony,
  PlannerPolicy,
  PriceBooks,
} from './goalTypes';
import { haulEffortOf } from './haulEffort';

export type ColonyBaseline =
  | { status: 'ok'; slots: ExtractionSlot[]; iskPerHour: number }
  /** P1 typeIds, sorted, the hub's bid book does not quote. */
  | { status: 'needs-price'; missing: number[] }
  | { status: 'nothing-fits' };

export interface BaselineTotal {
  /**
   * Summed over the colonies that came back `ok`. Partial whenever `missing`
   * is non-empty — a caller must not present it as the whole Baseline then.
   */
  iskPerHour: number;
  perColony: Map<number, ColonyBaseline>;
  /** Every unpriced P1 across all colonies, sorted. */
  missing: number[];
  /** The Baseline's hauling: each selling colony's P1 to the hub, weighted by jumps. */
  haulEffort: HaulEffort;
}

/** A finite bid, or undefined: an absent price is never a zero one. */
export function bidOf(books: PriceBooks, typeId: number): number | undefined {
  const price = books.bid[typeId];
  return price !== undefined && Number.isFinite(price) ? price : undefined;
}

/** What selling one P1 off this colony nets: bid after sales tax, less this colony's export customs. */
export function p1NetPerUnit(bid: number, colony: PlannerColony, books: PriceBooks): number {
  return bid * (1 - books.salesTaxPct / 100) - colony.taxRate * CUSTOMS_TAXABLE_VALUE[1];
}

function compareTie(a: ExtractionSlot[], b: ExtractionSlot[]): number {
  const ak = a.map((s) => s.p1TypeId).sort((x, y) => x - y);
  const bk = b.map((s) => s.p1TypeId).sort((x, y) => x - y);
  for (let i = 0; i < Math.min(ak.length, bk.length); i++) {
    if (ak[i] !== bk[i]) return ak[i] - bk[i];
  }
  if (ak.length !== bk.length) return ak.length - bk.length;
  const ecus = (slots: ExtractionSlot[]) => slots.reduce((sum, s) => sum + s.ecus, 0);
  return ecus(a) - ecus(b);
}

/** The best P1 sale this colony can run alone. */
export function colonyBaseline(
  colony: PlannerColony,
  pi: PiData,
  policy: PlannerPolicy,
  books: PriceBooks
): ColonyBaseline {
  const options = extractionOptions(colony, pi, policy);
  if (options.length === 0) return { status: 'nothing-fits' };

  const missing = new Set<number>();
  for (const option of options) {
    for (const slot of option.slots) {
      if (bidOf(books, slot.p1TypeId) === undefined) missing.add(slot.p1TypeId);
    }
  }
  if (missing.size > 0) {
    return { status: 'needs-price', missing: [...missing].sort((a, b) => a - b) };
  }

  let best: { slots: ExtractionSlot[]; iskPerHour: number } | null = null;
  for (const option of options) {
    const iskPerHour = option.slots.reduce(
      (sum, slot) =>
        sum + slot.p1PerHour * p1NetPerUnit(bidOf(books, slot.p1TypeId)!, colony, books),
      0
    );
    if (
      best === null ||
      iskPerHour > best.iskPerHour ||
      (iskPerHour === best.iskPerHour && compareTie(option.slots, best.slots) < 0)
    ) {
      best = { slots: option.slots, iskPerHour };
    }
  }
  // `options` is non-empty, so `best` is set. Selling at a loss is not what a
  // pilot does with a colony: one whose best P1 nets below its own customs
  // sells nothing, and its Baseline is zero, never negative.
  if (best!.iskPerHour <= 0) return { status: 'ok', slots: [], iskPerHour: 0 };
  return { status: 'ok', ...best! };
}

/** Every colony's Baseline, and their sum. */
export function baselineTotal(
  colonies: readonly PlannerColony[],
  pi: PiData,
  policy: PlannerPolicy,
  books: PriceBooks,
  /** Distances for `haulEffort`; without them every leg is unknown. */
  jumps?: JumpsFn
): BaselineTotal {
  const perColony = new Map<number, ColonyBaseline>();
  const missing = new Set<number>();
  let iskPerHour = 0;
  for (const colony of colonies) {
    const result = colonyBaseline(colony, pi, policy, books);
    perColony.set(colony.planetId, result);
    if (result.status === 'ok') iskPerHour += result.iskPerHour;
    if (result.status === 'needs-price') result.missing.forEach((id) => missing.add(id));
  }
  const legs = colonies.flatMap((colony) => {
    const result = perColony.get(colony.planetId);
    return result?.status === 'ok'
      ? result.slots.map((slot) => ({
          from: colony.planetId,
          to: 'hub' as const,
          typeId: slot.p1TypeId,
          unitsPerHour: slot.p1PerHour,
        }))
      : [];
  });
  return {
    iskPerHour,
    perColony,
    missing: [...missing].sort((a, b) => a - b),
    haulEffort: haulEffortOf(legs, pi, jumps),
  };
}
