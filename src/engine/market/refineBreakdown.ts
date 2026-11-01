/**
 * The arithmetic behind an Appraisal's Refine figure, laid out so a pilot can
 * check it against another tool: which minerals the pile refines into, at what
 * price, less the facility's tax, plus the units too few to fill a portion,
 * against what the same pile fetches sold as is into the buy orders.
 *
 * Pure. It re-derives nothing the Appraisal already decided: the recipe, the
 * yield applied and the prices read all arrive on each item's
 * `refine.detail` (`computeAppraisalRefine`), so a live result and a shared
 * snapshot go through this one function. An item with no `detail` has no
 * breakdown and is counted in `skipped`.
 *
 * The comparison is deliberately the table's: `refineBeatsSellAsIs` already
 * judges a row as refined value plus leftover units at the row's buy price
 * against its buy total, and this does the same over the whole pile.
 */
import { reprocessingYield } from '@/engine/industry/reprocessing';
import type { Appraisal, AppraisalItem, AppraisalRow } from './appraisal';

export interface RefineBreakdownInput {
  appraisal: Pick<Appraisal, 'rows' | 'items'>;
  /** The percentage of market the appraisal was priced at. */
  pricePercent: number;
  /** The facility's fee, a fraction (0.01 = 1%). */
  taxRate: number;
  /** Narrow to one item for a single row's breakdown. */
  onlyTypeId?: number;
}

export interface RefineMineralLine {
  typeId: number;
  quantity: number;
  /** ISK a unit at 100% of market; null where nobody buys it. */
  price: number | null;
  /** The quantity at `pricePercent` of that price, before tax; 0 where unpriced. */
  value: number;
}

export interface RefineItemLine {
  typeId: number;
  name: string;
  quantity: number;
  batches: number;
  portionSize: number;
  unitsLeftOver: number;
  efficiency: number;
  /** Material type id -> quantity returned, for the row's own arithmetic. */
  outputs: { typeId: number; perPortion: number; quantity: number }[];
  /** Minerals at `pricePercent`, less tax. */
  refined: number;
  leftoverValue: number;
  /** Selling the pasted quantity to buy orders as is. */
  asIs: number;
  wins: boolean;
}

export interface RefineBreakdown {
  items: RefineItemLine[];
  /** Largest value first. */
  minerals: RefineMineralLine[];
  /** Minerals at `pricePercent`, before tax. */
  mineralValue: number;
  tax: number;
  unitsLeftOver: number;
  leftoverValue: number;
  /** Minerals less tax, plus leftover units. */
  total: number;
  /** The same pile sold as is into the buy orders. */
  asIs: number;
  difference: number;
  refineWins: boolean;
  efficiencyMin: number | null;
  efficiencyMax: number | null;
  /**
   * The total efficiency, as a fraction, above which refining beats selling as
   * is, holding the items' efficiencies in proportion. Null when no yield
   * gets there, or when there is nothing to refine.
   */
  breakEvenEfficiency: number | null;
  /** False when a mineral had no price, so `total` is a floor. */
  pricedAll: boolean;
  /** Items left out for carrying no refine data. */
  skipped: number;
}

interface Refinable {
  item: AppraisalItem;
  row: AppraisalRow;
  detail: NonNullable<NonNullable<AppraisalItem['refine']>['detail']>;
}

function netMineralValue(
  refinables: readonly Refinable[],
  efficiencyScale: number,
  pricePercent: number,
  taxRate: number
): { value: number; leftover: number } {
  let value = 0;
  let leftover = 0;
  for (const { item, row, detail } of refinables) {
    const yielded = reprocessingYield({
      portionSize: detail.portionSize,
      materials: detail.materials,
      units: item.quantity,
      efficiency: detail.efficiency * efficiencyScale,
    });
    let gross = 0;
    for (const output of yielded.outputs) {
      gross += output.quantity * (detail.materialPrices[output.typeId] ?? 0);
    }
    value += (gross * pricePercent) / 100;
    leftover += yielded.unitsLeftOver * (row.buyEach ?? 0);
  }
  return { value: value * (1 - taxRate), leftover };
}

/** The lowest and highest efficiency the items were refined at; null when none carries refine detail. */
export function refineEfficiencyRange(
  items: readonly AppraisalItem[]
): { min: number; max: number } | null {
  const all = items.flatMap((item) => item.refine?.detail?.efficiency ?? []);
  return all.length === 0 ? null : { min: Math.min(...all), max: Math.max(...all) };
}

/** How far a yield can be scaled before refining stops losing; searched up to this multiple. */
const MAX_BREAK_EVEN_SCALE = 8;
const BREAK_EVEN_STEPS = 40;

export function buildRefineBreakdown({
  appraisal,
  pricePercent,
  taxRate,
  onlyTypeId,
}: RefineBreakdownInput): RefineBreakdown {
  const refinables: Refinable[] = [];
  let skipped = 0;
  appraisal.items.forEach((item, index) => {
    if (onlyTypeId !== undefined && item.typeId !== onlyTypeId) return;
    const row = appraisal.rows[index];
    const detail = item.refine?.detail;
    if (!row || !detail) {
      skipped += 1;
      return;
    }
    refinables.push({ item, row, detail });
  });

  const items: RefineItemLine[] = [];
  const minerals = new Map<number, RefineMineralLine>();
  let mineralValue = 0;
  let unitsLeftOver = 0;
  let leftoverValue = 0;
  let asIs = 0;
  let pricedAll = true;

  for (const { item, row, detail } of refinables) {
    const yielded = reprocessingYield({
      portionSize: detail.portionSize,
      materials: detail.materials,
      units: item.quantity,
      efficiency: detail.efficiency,
    });
    let gross = 0;
    for (const output of yielded.outputs) {
      const price = detail.materialPrices[output.typeId];
      const value = price === undefined ? 0 : (output.quantity * price * pricePercent) / 100;
      if (price === undefined) pricedAll = false;
      gross += value;
      const line = minerals.get(output.typeId) ?? {
        typeId: output.typeId,
        quantity: 0,
        price: price ?? null,
        value: 0,
      };
      line.quantity += output.quantity;
      line.value += value;
      minerals.set(output.typeId, line);
    }
    const refined = gross * (1 - taxRate);
    const itemLeftover = yielded.unitsLeftOver * (row.buyEach ?? 0);
    const itemAsIs = row.buyTotal ?? 0;
    mineralValue += gross;
    unitsLeftOver += yielded.unitsLeftOver;
    leftoverValue += itemLeftover;
    asIs += itemAsIs;
    items.push({
      typeId: item.typeId,
      name: item.name,
      quantity: item.quantity,
      batches: yielded.batches,
      portionSize: detail.portionSize,
      unitsLeftOver: yielded.unitsLeftOver,
      efficiency: detail.efficiency,
      outputs: detail.materials.map((material) => ({
        typeId: material.typeId,
        perPortion: material.quantity,
        quantity: yielded.outputs.find((o) => o.typeId === material.typeId)?.quantity ?? 0,
      })),
      refined,
      leftoverValue: itemLeftover,
      asIs: itemAsIs,
      wins: refined + itemLeftover > itemAsIs,
    });
  }

  const tax = mineralValue * taxRate;
  const total = mineralValue - tax + leftoverValue;
  const efficiencies = items.map((line) => line.efficiency);

  return {
    items,
    minerals: [...minerals.values()].sort((a, b) => b.value - a.value),
    mineralValue,
    tax,
    unitsLeftOver,
    leftoverValue,
    total,
    asIs,
    difference: total - asIs,
    refineWins: total > asIs,
    efficiencyMin: efficiencies.length > 0 ? Math.min(...efficiencies) : null,
    efficiencyMax: efficiencies.length > 0 ? Math.max(...efficiencies) : null,
    breakEvenEfficiency: breakEvenEfficiency(items, refinables, asIs, pricePercent, taxRate),
    pricedAll,
    skipped,
  };
}

/**
 * Bisects the multiple of every item's efficiency at which refine ties selling
 * as is, then states it as an efficiency: the multiple times the items'
 * mean, weighted by what each refines to. The total only ever rises with the
 * yield (more minerals, never fewer), so the search is sound.
 */
function breakEvenEfficiency(
  items: readonly RefineItemLine[],
  refinables: readonly Refinable[],
  asIs: number,
  pricePercent: number,
  taxRate: number
): number | null {
  if (items.length === 0 || asIs <= 0) return null;
  const totalAt = (scale: number): number => {
    const { value, leftover } = netMineralValue(refinables, scale, pricePercent, taxRate);
    return value + leftover;
  };
  if (totalAt(MAX_BREAK_EVEN_SCALE) <= asIs) return null;
  let low = 0;
  let high = MAX_BREAK_EVEN_SCALE;
  for (let step = 0; step < BREAK_EVEN_STEPS; step += 1) {
    const mid = (low + high) / 2;
    if (totalAt(mid) > asIs) high = mid;
    else low = mid;
  }
  const weight = items.reduce((sum, line) => sum + line.refined, 0);
  const mean =
    weight > 0
      ? items.reduce((sum, line) => sum + line.efficiency * line.refined, 0) / weight
      : items.reduce((sum, line) => sum + line.efficiency, 0) / items.length;
  return high * mean;
}
