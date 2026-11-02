/**
 * The arithmetic behind an Appraisal's Refine figure, laid out so a pilot can
 * check it against another tool: which minerals the pile refines into, at what
 * price, less the facility's tax, plus the units too few to fill a portion,
 * against what the same pile fetches sold as is. Everything is priced on one
 * Price Basis (the buy orders, the sell orders, or halfway between), and
 * `buildRefineComparison` does all three at once.
 *
 * Pure. It re-derives nothing the Appraisal already decided: the recipe, the
 * yield applied and the prices read all arrive on each item's
 * `refine.detail` (`computeAppraisalRefine`), so a live result and a shared
 * snapshot go through this one function. An item with no `detail` has no
 * breakdown and is counted in `skipped`.
 *
 * The comparison is deliberately the table's: `refineBeatsSellAsIs` judges a
 * row as refined value plus leftover units, at the row's as-is unit price on
 * the basis, against its as-is total on the basis (`asIsEachFor` /
 * `asIsTotalFor`), and this does the same over the whole pile. A row with no
 * as-is price on the basis is no comparison there: not a win.
 */
import { reprocessingYield } from '@/engine/industry/reprocessing';
import { netOfReprocessingTax } from '@/engine/industry/refiningSetup';
import {
  asIsEachFor,
  asIsTotalFor,
  priceOnBasis,
  REFINE_BASES,
  type Appraisal,
  type AppraisalItem,
  type AppraisalRow,
  type AppraisalRefineDetail,
  type RefineBasis,
} from './appraisal';

export interface RefineBreakdownInput {
  appraisal: Pick<Appraisal, 'rows' | 'items'>;
  /** The percentage of market the appraisal was priced at. */
  pricePercent: number;
  /** The facility's fee, a fraction (0.01 = 1%). */
  taxRate: number;
  /** Narrow to one item for a single row's breakdown. */
  onlyTypeId?: number;
  /** Which side of the book the minerals and the as-is pile are priced on; default the buy orders. */
  basis?: RefineBasis;
}

export interface RefineMineralLine {
  typeId: number;
  quantity: number;
  /** ISK a unit at 100% of market on the breakdown's basis; null where that side has no price. */
  price: number | null;
  /** The same mineral's buy and sell unit prices, whatever the basis; null where that side has none. */
  buyPrice: number | null;
  sellPrice: number | null;
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
  /** Selling the pasted quantity as is, on the breakdown's basis. */
  asIs: number;
  wins: boolean;
}

export interface RefineBreakdown {
  /** The side of the book everything here is priced on. */
  basis: RefineBasis;
  items: RefineItemLine[];
  /** Largest value first. */
  minerals: RefineMineralLine[];
  /** Minerals at `pricePercent`, before tax. */
  mineralValue: number;
  tax: number;
  /** Minerals less tax: what the table's Refine figure and the header chip sum to. */
  net: number;
  unitsLeftOver: number;
  leftoverValue: number;
  /** `net` plus the leftover units sold as is: what refining the pile leaves you holding. */
  total: number;
  /** The same pile sold as is, on the basis. */
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
  /** Items nobody buys as is here, so selling them as is counts for 0. */
  unbuyable: number;
}

interface Refinable {
  item: AppraisalItem;
  row: AppraisalRow;
  detail: NonNullable<NonNullable<AppraisalItem['refine']>['detail']>;
}

/** One mineral's unit price on a basis; undefined where a side it needs has none. */
function mineralPrice(
  detail: AppraisalRefineDetail,
  typeId: number,
  basis: RefineBasis
): number | undefined {
  return (
    priceOnBasis(basis, detail.materialPrices[typeId], detail.materialSellPrices?.[typeId]) ??
    undefined
  );
}

function netMineralValue(
  refinables: readonly Refinable[],
  basis: RefineBasis,
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
      gross += output.quantity * (mineralPrice(detail, output.typeId, basis) ?? 0);
    }
    value += (gross * pricePercent) / 100;
    leftover += yielded.unitsLeftOver * (asIsEachFor(row, basis) ?? 0);
  }
  return { value: netOfReprocessingTax(value, taxRate), leftover };
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
  basis = 'buy',
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
  let unbuyable = 0;

  for (const { item, row, detail } of refinables) {
    const yielded = reprocessingYield({
      portionSize: detail.portionSize,
      materials: detail.materials,
      units: item.quantity,
      efficiency: detail.efficiency,
    });
    let gross = 0;
    for (const output of yielded.outputs) {
      const price = mineralPrice(detail, output.typeId, basis);
      const value = price === undefined ? 0 : (output.quantity * price * pricePercent) / 100;
      if (price === undefined) pricedAll = false;
      gross += value;
      const line = minerals.get(output.typeId) ?? {
        typeId: output.typeId,
        quantity: 0,
        price: price ?? null,
        buyPrice: detail.materialPrices[output.typeId] ?? null,
        sellPrice: detail.materialSellPrices?.[output.typeId] ?? null,
        value: 0,
      };
      line.quantity += output.quantity;
      line.value += value;
      minerals.set(output.typeId, line);
    }
    const refined = netOfReprocessingTax(gross, taxRate);
    const itemLeftover = yielded.unitsLeftOver * (asIsEachFor(row, basis) ?? 0);
    const itemAsIs = asIsTotalFor(row, basis) ?? 0;
    if (asIsTotalFor(row, basis) === null || asIsEachFor(row, basis) === null) unbuyable += 1;
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
      // No as-is price on this basis is no comparison, as in the table: not a win.
      wins:
        asIsTotalFor(row, basis) !== null &&
        asIsEachFor(row, basis) !== null &&
        refined + itemLeftover > itemAsIs,
    });
  }

  const net = netOfReprocessingTax(mineralValue, taxRate);
  const tax = mineralValue - net;
  const total = net + leftoverValue;
  const efficiencies = items.map((line) => line.efficiency);

  return {
    basis,
    items,
    minerals: [...minerals.values()].sort((a, b) => b.value - a.value),
    mineralValue,
    tax,
    net,
    unitsLeftOver,
    leftoverValue,
    total,
    asIs,
    difference: total - asIs,
    refineWins: total > asIs,
    efficiencyMin: efficiencies.length > 0 ? Math.min(...efficiencies) : null,
    efficiencyMax: efficiencies.length > 0 ? Math.max(...efficiencies) : null,
    breakEvenEfficiency: breakEvenEfficiency(items, refinables, basis, asIs, pricePercent, taxRate),
    pricedAll,
    skipped,
    unbuyable,
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
  basis: RefineBasis,
  asIs: number,
  pricePercent: number,
  taxRate: number
): number | null {
  if (items.length === 0 || asIs <= 0) return null;
  const totalAt = (scale: number): number => {
    const { value, leftover } = netMineralValue(refinables, basis, scale, pricePercent, taxRate);
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

/**
 * Whether a basis can be priced for these items: the sell and split sides need
 * the minerals' sell prices, which a share link from before they travelled
 * with it does not carry. The buy side is always there.
 */
export function basisAvailable(
  appraisal: Pick<Appraisal, 'items'>,
  basis: RefineBasis,
  onlyTypeId?: number
): boolean {
  if (basis === 'buy') return true;
  return appraisal.items
    .filter((item) => onlyTypeId === undefined || item.typeId === onlyTypeId)
    .every((item) => !item.refine?.detail || item.refine.detail.materialSellPrices !== undefined);
}

/** The breakdown on every basis. The buy side is always there; the others need the sell side to have been read. */
export type RefineComparison = Record<RefineBasis, RefineBreakdown | null> & {
  buy: RefineBreakdown;
};

/** The breakdown on every price basis at once, for the side-by-side comparison. */
export function buildRefineComparison(
  input: Omit<RefineBreakdownInput, 'basis'>
): RefineComparison {
  const on = (basis: RefineBasis): RefineBreakdown | null =>
    basisAvailable(input.appraisal, basis, input.onlyTypeId)
      ? buildRefineBreakdown({ ...input, basis })
      : null;
  return {
    ...Object.fromEntries(REFINE_BASES.map((basis) => [basis, on(basis)])),
    buy: buildRefineBreakdown({ ...input, basis: 'buy' }),
  } as RefineComparison;
}

/** An item whose sell price is this many times its buy price is lopsided: a thin book, not a market. */
export const LOPSIDED_SELL_RATIO = 10;

/**
 * Items whose sell price dwarfs their buy price, which props up the Sell and
 * Split bases (one uncompressed ore sat at 46x its compressed price). The
 * figures stay as the market shows them; this is what lets a caller say so.
 */
export function lopsidedItems(
  items: readonly Pick<AppraisalItem, 'typeId' | 'name' | 'buy' | 'sell'>[],
  onlyTypeId?: number
): { typeId: number; name: string }[] {
  return items.filter(
    (item) =>
      (onlyTypeId === undefined || item.typeId === onlyTypeId) &&
      item.buy !== null &&
      item.sell !== null &&
      item.buy > 0 &&
      item.sell > item.buy * LOPSIDED_SELL_RATIO
  );
}
