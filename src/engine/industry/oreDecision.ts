import { reprocessingValue, reprocessingYield, type ReprocessingMaterial } from './reprocessing';
import { netOfReprocessingTax } from './refiningSetup';

export interface OreStack {
  typeId: number;
  units: number;
  portionSize: number;
  materials: readonly ReprocessingMaterial[];
  efficiency: number;
  rawUnitPrice: number;
}

export interface OreAllocation {
  typeId: number;
  batchesUsed: number;
  unitsUsed: number;
  unitsNotUsed: number;
  credited: Record<number, number>;
}

export interface OreAllocationResult {
  ores: OreAllocation[];
  covered: Record<number, number>;
}

export function allocateOreToNeeds(
  needs: Readonly<Record<number, number>>,
  stacks: readonly OreStack[]
): OreAllocationResult {
  const remaining: Record<number, number> = {};
  for (const [id, qty] of Object.entries(needs)) if (qty > 0) remaining[Number(id)] = qty;
  const covered: Record<number, number> = {};

  const perBatch = (stack: OreStack) =>
    reprocessingYield({
      portionSize: stack.portionSize,
      materials: stack.materials,
      units: stack.portionSize,
      efficiency: stack.efficiency,
    }).outputs.filter((o) => (needs[o.typeId] ?? 0) > 0);

  const cost = (stack: OreStack) => {
    const mineral = perBatch(stack).reduce((sum, o) => sum + o.quantity, 0);
    return mineral > 0 ? (stack.rawUnitPrice * stack.portionSize) / mineral : Infinity;
  };

  const order = stacks
    .map((stack, index) => ({ stack, index, cost: cost(stack) }))
    .sort((a, b) => a.cost - b.cost || a.index - b.index);

  const byIndex = new Map<number, OreAllocation>();
  for (const { stack, index } of order) {
    const alloc: OreAllocation = {
      typeId: stack.typeId,
      batchesUsed: 0,
      unitsUsed: 0,
      unitsNotUsed: stack.units,
      credited: {},
    };
    byIndex.set(index, alloc);
    const available = stack.portionSize > 0 ? Math.floor(stack.units / stack.portionSize) : 0;
    let wanted = 0;
    for (const o of perBatch(stack)) {
      const left = remaining[o.typeId] ?? 0;
      if (left > 0) wanted = Math.max(wanted, Math.ceil(left / o.quantity));
    }
    const batches = Math.min(available, wanted);
    if (batches <= 0) continue;
    const y = reprocessingYield({
      portionSize: stack.portionSize,
      materials: stack.materials,
      units: batches * stack.portionSize,
      efficiency: stack.efficiency,
    });
    for (const o of y.outputs) {
      const left = remaining[o.typeId] ?? 0;
      const credit = Math.min(left, o.quantity);
      if (credit <= 0) continue;
      remaining[o.typeId] = left - credit;
      alloc.credited[o.typeId] = credit;
      covered[o.typeId] = (covered[o.typeId] ?? 0) + credit;
    }
    alloc.batchesUsed = batches;
    alloc.unitsUsed = y.unitsRefined;
    alloc.unitsNotUsed = stack.units - y.unitsRefined;
  }
  return { ores: stacks.map((_, i) => byIndex.get(i)!), covered };
}

export interface MineralCoverage {
  typeId: number;
  need: number;
  covered: number;
  percent: number;
}

export function planCoverage(
  needs: Readonly<Record<number, number>>,
  covered: Readonly<Record<number, number>>
): MineralCoverage[] {
  return Object.entries(needs)
    .filter(([, need]) => need > 0)
    .map(([id, need]) => {
      const c = Math.min(need, covered[Number(id)] ?? 0);
      return { typeId: Number(id), need, covered: c, percent: Math.round((c / need) * 100) };
    });
}

export interface OreExitValues {
  sellRaw: number;
  refineThenSell: number;
  outputs: ReprocessingMaterial[];
  unitsLeftOver: number;
  pricedAll: boolean;
}

export function valueOreExits(input: {
  stack: Pick<OreStack, 'units' | 'portionSize' | 'materials' | 'efficiency' | 'rawUnitPrice'>;
  mineralPrices: Readonly<Record<number, number>>;
  salesTaxPct: number;
  reprocessingTaxRate?: number;
}): OreExitValues {
  const { stack, mineralPrices, salesTaxPct, reprocessingTaxRate = 0 } = input;
  const net = 1 - salesTaxPct / 100;
  const y = reprocessingYield(stack);
  const refined = reprocessingValue(y.outputs, mineralPrices);
  return {
    sellRaw: Math.max(0, stack.rawUnitPrice) * stack.units * net,
    refineThenSell: netOfReprocessingTax(refined.total, reprocessingTaxRate) * net,
    outputs: y.outputs,
    unitsLeftOver: y.unitsLeftOver,
    pricedAll: refined.pricedAll && stack.rawUnitPrice > 0,
  };
}
