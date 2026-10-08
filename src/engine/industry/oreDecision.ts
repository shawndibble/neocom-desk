/**
 * "What to do with this ore" (issue #2836): how much of an ore stock a plan
 * could use as minerals, and which ore to give up first.
 *
 * Pure. Yields come from `reprocessing.ts`, which refuses to guess the
 * facility or the tax; the caller states those assumptions.
 */
import {
  BASE_STATION_REPROCESSING_RATE,
  reprocessingValue,
  reprocessingYield,
  type ReprocessingMaterial,
} from './reprocessing';

export interface OreStack {
  typeId: number;
  units: number;
  portionSize: number;
  materials: readonly ReprocessingMaterial[];
  /** From `reprocessingEfficiency` / `refiningEfficiency`. */
  efficiency: number;
  /** What one unit fetches sold raw; decides which ore is used first. */
  rawUnitPrice: number;
}

export interface OreAllocation {
  typeId: number;
  batchesUsed: number;
  unitsUsed: number;
  /** Ore left over: unused batches plus the part-portion remainder. */
  unitsNotUsed: number;
  /** Minerals credited to the plan, capped at what it still needed. */
  credited: Record<number, number>;
}

export interface OreAllocationResult {
  /** One entry per input stack, in input order. */
  ores: OreAllocation[];
  /** Total minerals credited per type id. */
  covered: Record<number, number>;
}

/**
 * Spread ore stacks over a plan's mineral needs. The ore that costs least to
 * give up (raw value per unit of needed mineral) goes first; each is capped at
 * what the plan still needs. An ore refining into several needed minerals is
 * taken once and credits every mineral it yields.
 */
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
  /** 0-100, rounded. */
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

/** The facility's own rate: an NPC station is the 50% base; only 'My structure' takes a typed rate. */
export function resolveRefiningRate(input: {
  facility: 'npc' | 'structure';
  typedRate?: number;
}): number {
  if (input.facility === 'structure' && input.typedRate !== undefined && input.typedRate > 0) {
    return input.typedRate;
  }
  return BASE_STATION_REPROCESSING_RATE;
}

export interface OreExitValues {
  /** Net of sales tax, at the buy price given. 0 when unpriced. */
  sellRaw: number;
  /** Refined minerals, net of sales tax. A floor when `pricedAll` is false. */
  refineThenSell: number;
  outputs: ReprocessingMaterial[];
  /** The portion trap: units that refine into nothing. */
  unitsLeftOver: number;
  pricedAll: boolean;
}

/** Sell raw against refine-then-sell for one stack, both at the same buy prices and tax. */
export function valueOreExits(input: {
  stack: Pick<OreStack, 'units' | 'portionSize' | 'materials' | 'efficiency' | 'rawUnitPrice'>;
  mineralPrices: Readonly<Record<number, number>>;
  salesTaxPct: number;
}): OreExitValues {
  const { stack, mineralPrices, salesTaxPct } = input;
  const net = 1 - salesTaxPct / 100;
  const y = reprocessingYield(stack);
  const refined = reprocessingValue(y.outputs, mineralPrices);
  return {
    sellRaw: Math.max(0, stack.rawUnitPrice) * stack.units * net,
    refineThenSell: refined.total * net,
    outputs: y.outputs,
    unitsLeftOver: y.unitsLeftOver,
    pricedAll: refined.pricedAll && stack.rawUnitPrice > 0,
  };
}
