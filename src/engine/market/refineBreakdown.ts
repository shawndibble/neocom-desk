import { reprocessingYield } from '@/engine/industry/reprocessing';
import { netOfReprocessingTax } from '@/engine/industry/refiningSetup';
import { asIsFigures } from './appraisalRowFigures';
import {
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
  pricePercent: number;
  taxRate: number;
  onlyTypeId?: number;
  basis?: RefineBasis;
}

export interface RefineMineralLine {
  typeId: number;
  quantity: number;
  price: number | null;
  buyPrice: number | null;
  sellPrice: number | null;
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
  outputs: { typeId: number; perPortion: number; quantity: number }[];
  refined: number;
  leftoverValue: number;
  asIs: number;
  wins: boolean;
}

export interface RefineBreakdown {
  basis: RefineBasis;
  items: RefineItemLine[];
  minerals: RefineMineralLine[];
  mineralValue: number;
  tax: number;
  net: number;
  unitsLeftOver: number;
  leftoverValue: number;
  total: number;
  asIs: number;
  difference: number;
  refineWins: boolean;
  efficiencyMin: number | null;
  efficiencyMax: number | null;
  breakEvenEfficiency: number | null;
  pricedAll: boolean;
  skipped: number;
  unbuyable: number;
}

interface Refinable {
  item: AppraisalItem;
  row: AppraisalRow;
  detail: NonNullable<NonNullable<AppraisalItem['refine']>['detail']>;
}

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
    leftover += yielded.unitsLeftOver * (asIsFigures(row, basis).each ?? 0);
  }
  return { value: netOfReprocessingTax(value, taxRate), leftover };
}

export function refineEfficiencyRange(
  items: readonly AppraisalItem[]
): { min: number; max: number } | null {
  const all = items.flatMap((item) => item.refine?.detail?.efficiency ?? []);
  return all.length === 0 ? null : { min: Math.min(...all), max: Math.max(...all) };
}

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
    const rowAsIs = asIsFigures(row, basis);
    const unpriced = rowAsIs.total === null || rowAsIs.each === null;
    const itemLeftover = yielded.unitsLeftOver * (rowAsIs.each ?? 0);
    const itemAsIs = rowAsIs.total ?? 0;
    if (unpriced) unbuyable += 1;
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
      wins: !unpriced && refined + itemLeftover > itemAsIs,
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

export type RefineComparison = Record<RefineBasis, RefineBreakdown | null> & {
  buy: RefineBreakdown;
};

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

export const LOPSIDED_SELL_RATIO = 10;

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
