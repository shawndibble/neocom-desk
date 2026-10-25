/**
 * "Buy ore instead": which compressed ore to buy and refine to cover a mineral
 * shortfall. A small integer program, solved greedily plus a repair pass that
 * trims redundant batches: cheapest (or lightest) route found, not proven optimal.
 * Ore is bought in whole portions; leftover minerals are valued at the hub buy price.
 */
import { reprocessingYield, type ReprocessingMaterial } from './reprocessing';

export type OreOrdering = 'cost' | 'volume';

export interface BuyableOre {
  typeId: number;
  portionSize: number;
  materials: readonly ReprocessingMaterial[];
  /** From `refiningEfficiency`. */
  efficiency: number;
  /** Hub sell price per unit; null when none is listed, which skips the ore. */
  unitPrice: number | null;
  /** m³ per unit. */
  unitVolume: number;
}

export interface OrePurchase {
  typeId: number;
  batches: number;
  /** Units to buy: whole portions only. */
  units: number;
  /** At the candidate's flat unit price; the caller may re-price from the order book. */
  cost: number;
  volume: number;
  /** Minerals this purchase refines into. */
  outputs: Record<number, number>;
}

export interface OreRoute {
  purchases: OrePurchase[];
  /** Total minerals refined per type id. */
  refined: Record<number, number>;
  /** Refined beyond the shortfall. */
  leftovers: Record<number, number>;
  /** Shortfall minerals no candidate ore yields. */
  uncovered: number[];
  cost: number;
  volume: number;
}

function outputsOf(ore: BuyableOre, batches: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (const o of reprocessingYield({ ...ore, units: batches * ore.portionSize }).outputs) {
    out[o.typeId] = o.quantity;
  }
  return out;
}

export function planOreBuy(input: {
  needs: Readonly<Record<number, number>>;
  ores: readonly BuyableOre[];
  ordering: OreOrdering;
  /** Weights minerals when ranking ores; unpriced minerals weigh 1. */
  mineralPrices?: Readonly<Record<number, number>>;
}): OreRoute {
  const { ordering, mineralPrices = {} } = input;
  const need: Record<number, number> = {};
  for (const [id, qty] of Object.entries(input.needs)) if (qty > 0) need[Number(id)] = qty;
  // An ore with no known volume would read as free to haul, so it cannot be ranked by weight.
  const ores = input.ores.filter(
    (o) =>
      o.portionSize > 0 &&
      o.unitPrice !== null &&
      o.unitPrice >= 0 &&
      (ordering === 'cost' || o.unitVolume > 0)
  );
  const metricPerBatch = (o: BuyableOre) =>
    (ordering === 'cost' ? o.unitPrice! : o.unitVolume) * o.portionSize;
  const yieldsRate = (o: BuyableOre, id: number) => {
    const m = o.materials.find((x) => x.typeId === id);
    return m ? m.quantity * o.efficiency : 0;
  };

  const uncovered = Object.keys(need)
    .map(Number)
    .filter((id) => !ores.some((o) => yieldsRate(o, id) > 0));

  const remaining: Record<number, number> = {};
  for (const id of Object.keys(need).map(Number))
    if (!uncovered.includes(id)) remaining[id] = need[id]!;
  const batchesOf = new Map<number, number>();

  // ISK weights rank ores by cost; hauling is per unit of mineral, so volume weighs all alike.
  const weight = (id: number) =>
    ordering === 'cost' && (mineralPrices[id] ?? 0) > 0 ? mineralPrices[id]! : 1;
  for (;;) {
    let best: { ore: BuyableOre; k: number; score: number } | null = null;
    for (const ore of ores) {
      let useful = 0;
      let k = Infinity;
      for (const [idStr, left] of Object.entries(remaining)) {
        if (left <= 0) continue;
        const rate = yieldsRate(ore, Number(idStr));
        if (rate <= 0) continue;
        useful += Math.min(left, rate) * weight(Number(idStr));
        k = Math.min(k, Math.ceil(left / rate));
      }
      if (useful <= 0 || !Number.isFinite(k)) continue;
      const score = metricPerBatch(ore) / useful;
      if (!best || score < best.score) best = { ore, k: Math.max(1, k), score };
    }
    if (!best) break;
    const total = (batchesOf.get(best.ore.typeId) ?? 0) + best.k;
    batchesOf.set(best.ore.typeId, total);
    // Credit exactly what the whole purchase now refines, not a per-batch estimate.
    const before = outputsOf(best.ore, total - best.k);
    const after = outputsOf(best.ore, total);
    for (const id of Object.keys(remaining).map(Number)) {
      remaining[id]! -= (after[id] ?? 0) - (before[id] ?? 0);
    }
  }

  const coveredBy = (counts: ReadonlyMap<number, number>) => {
    const got: Record<number, number> = {};
    for (const ore of ores) {
      const b = counts.get(ore.typeId) ?? 0;
      if (b <= 0) continue;
      for (const [id, q] of Object.entries(outputsOf(ore, b)))
        got[Number(id)] = (got[Number(id)] ?? 0) + q;
    }
    return got;
  };
  const covers = (got: Record<number, number>) =>
    Object.keys(need).every((idStr) => {
      const id = Number(idStr);
      return uncovered.includes(id) || (got[id] ?? 0) >= need[id]!;
    });

  // Repair: dearest purchase first, binary-search the fewest batches that still cover.
  const oreById = new Map(ores.map((o) => [o.typeId, o]));
  const byMetric = [...batchesOf.keys()].sort(
    (a, b) => metricPerBatch(oreById.get(b)!) - metricPerBatch(oreById.get(a)!)
  );
  for (const typeId of byMetric) {
    let lo = 0;
    let hi = batchesOf.get(typeId)!;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const trial = new Map(batchesOf).set(typeId, mid);
      if (covers(coveredBy(trial))) hi = mid;
      else lo = mid + 1;
    }
    batchesOf.set(typeId, lo);
  }

  const purchases: OrePurchase[] = [];
  for (const ore of ores) {
    const batches = batchesOf.get(ore.typeId) ?? 0;
    if (batches <= 0) continue;
    const units = batches * ore.portionSize;
    purchases.push({
      typeId: ore.typeId,
      batches,
      units,
      cost: units * ore.unitPrice!,
      volume: units * ore.unitVolume,
      outputs: outputsOf(ore, batches),
    });
  }
  const refined = coveredBy(batchesOf);
  const leftovers: Record<number, number> = {};
  for (const [idStr, q] of Object.entries(refined)) {
    const extra = q - (need[Number(idStr)] ?? 0);
    if (extra > 0) leftovers[Number(idStr)] = extra;
  }
  return {
    purchases,
    refined,
    leftovers,
    uncovered,
    cost: purchases.reduce((s, p) => s + p.cost, 0),
    volume: purchases.reduce((s, p) => s + p.volume, 0),
  };
}

export interface OreRouteComparison {
  oreCost: number;
  /** Leftover minerals at the hub buy price. */
  leftoverValue: number;
  /** Leftover mineral type ids with no buy price: counted as 0, never as free value. */
  leftoverUnpriced: number[];
  /** `oreCost` less `leftoverValue`. */
  oreNet: number;
  mineralsTotal: number;
  /** Positive when the ore route is cheaper. */
  saving: number;
  recommendOre: boolean;
}

export function compareOreRoute(input: {
  route: OreRoute;
  /** What buying the shortfall minerals costs, as the plan prices them. */
  mineralsTotal: number;
  mineralBuyPrices: Readonly<Record<number, number>>;
  /** Ore cost re-priced from the order book; defaults to the route's flat cost. */
  oreCost?: number;
}): OreRouteComparison {
  const { route, mineralsTotal, mineralBuyPrices } = input;
  let leftoverValue = 0;
  const leftoverUnpriced: number[] = [];
  for (const [idStr, qty] of Object.entries(route.leftovers)) {
    const price = mineralBuyPrices[Number(idStr)];
    if (price && price > 0) leftoverValue += qty * price;
    else leftoverUnpriced.push(Number(idStr));
  }
  const oreCost = input.oreCost ?? route.cost;
  const oreNet = oreCost - leftoverValue;
  const saving = mineralsTotal - oreNet;
  return {
    oreCost,
    leftoverValue,
    leftoverUnpriced,
    oreNet,
    mineralsTotal,
    saving,
    recommendOre: route.uncovered.length === 0 && route.purchases.length > 0 && saving > 0,
  };
}

/** The in-game multibuy format: `name<TAB>units` per line. */
export function oreBuyListText(
  purchases: readonly Pick<OrePurchase, 'typeId' | 'units'>[],
  nameFor: (typeId: number) => string
): string {
  return purchases.map((p) => `${nameFor(p.typeId)}\t${p.units}`).join('\n');
}

/** Tritanium through Megacyte, and Morphite: the minerals compressed ore refines into. */
export const MINERAL_TYPE_IDS: ReadonlySet<number> = new Set([34, 35, 36, 37, 38, 39, 40, 11399]);

export interface MineralShortfall {
  /** Units still to buy, per mineral type id. */
  needs: Record<number, number>;
  /** What buying them costs as the plan prices them; null when any is unpriced. */
  total: number | null;
}

/** The mineral rows a plan still has to buy; empty when it has none. Built rows are never bought. */
export function mineralShortfall(
  rows: readonly {
    typeID: number;
    remainingQuantity: number;
    lineCost: number | null;
    subBuilds?: readonly unknown[];
  }[]
): MineralShortfall {
  const needs: Record<number, number> = {};
  let total: number | null = 0;
  for (const row of rows) {
    if (!MINERAL_TYPE_IDS.has(row.typeID) || row.remainingQuantity <= 0) continue;
    if (row.subBuilds && row.subBuilds.length > 0) continue;
    needs[row.typeID] = (needs[row.typeID] ?? 0) + row.remainingQuantity;
    total = total === null || row.lineCost === null ? null : total + row.lineCost;
  }
  return { needs, total };
}
