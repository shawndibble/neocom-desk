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
  | { status: 'needs-price'; missing: number[] }
  | { status: 'nothing-fits' };

export interface BaselineTotal {
  iskPerHour: number;
  perColony: Map<number, ColonyBaseline>;
  missing: number[];
  haulEffort: HaulEffort;
}

export function bidOf(books: PriceBooks, typeId: number): number | undefined {
  const price = books.bid[typeId];
  return price !== undefined && Number.isFinite(price) ? price : undefined;
}

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
  if (best!.iskPerHour <= 0) return { status: 'ok', slots: [], iskPerHour: 0 };
  return { status: 'ok', ...best! };
}

export function baselineTotal(
  colonies: readonly PlannerColony[],
  pi: PiData,
  policy: PlannerPolicy,
  books: PriceBooks,
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
