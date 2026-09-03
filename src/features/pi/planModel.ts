/**
 * Everything the chain planner puts on screen that is arithmetic rather than
 * layout, kept out of the components so the numbers can be asserted directly.
 *
 * `engine/pi/chain.ts` is not touched and not wrapped: `costPlan` calls it and
 * translates the two ways it can decline to answer into states a component can
 * render.
 *
 * - **A missing price is checked before the call, not caught after it.** The
 *   engine throws on the first unpriced type, which names one commodity; the
 *   user needs the whole list to know whether the hub is the problem or the
 *   item is. `missingPriceIds` asks the same question the engine asks, per
 *   floor, and the try/catch that remains is a guard against the engine
 *   growing a new throw, not the mechanism.
 * - **A floor at or above the target's own tier is refused here.** The engine
 *   throws for it because nothing would be made; the UI must never offer it,
 *   so `validFloors` drives the control and `costPlan` returns a state rather
 *   than relying on it.
 *
 * Priceability is per floor, not global: the P3 floor needs three P3 prices
 * and the target's, and does not care that a P1 four levels down is unquoted.
 * That is why `sensitivityGrid` degrades one row at a time.
 *
 * `taxSplit` reconstructs the three sides of `taxBase` the engine sums into
 * one number, because the layout decision the planner exists to inform is
 * visible in exactly one of them: the between-planets share is zero on
 * `single-planet` and is the whole penalty on `planet-per-tier`. It is
 * reconstruction, not a second tax model — `planModel.test.ts` asserts the
 * three parts add back up to the engine's own `taxBase`.
 */
import {
  CUSTOMS_TAXABLE_VALUE,
  IMPORT_TAXABLE_FRACTION,
  chainCost,
  type ChainCostBreakdown,
  type ChainLayout,
  type ChainNode,
  type PiChain,
  type PiTier,
  type SourcingFloor,
} from '@/engine/pi/chain';

const FLOOR_TIER: Readonly<Record<SourcingFloor, PiTier>> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const ALL_FLOORS: readonly SourcingFloor[] = ['P0', 'P1', 'P2', 'P3'];

/** Floors strictly below the target's tier — at or above it there is nothing to make. */
export function validFloors(targetTier: PiTier): SourcingFloor[] {
  return ALL_FLOORS.filter((floor) => FLOOR_TIER[floor] < targetTier);
}

function nodeIndex(chain: PiChain): Map<number, ChainNode> {
  return new Map(chain.nodes.map((node) => [node.typeId, node]));
}

/**
 * Factory pins the made tiers cost. Planets, not ISK, are the scarce resource
 * — a character is capped at six — so this rides beside every margin rather
 * than living in a detail view.
 */
export function factoryPinsAbove(chain: PiChain, floor: SourcingFloor): number {
  const floorTier = FLOOR_TIER[floor];
  return chain.nodes
    .filter((node) => node.tier > floorTier)
    .reduce((sum, node) => sum + (node.factoryPins ?? 0), 0);
}

/** Planets the layout spreads the made tiers over — the same count the engine taxes across. */
export function planetCountFor(chain: PiChain, floor: SourcingFloor, layout: ChainLayout): number {
  if (layout === 'single-planet') return 1;
  const floorTier = FLOOR_TIER[floor];
  return new Set(chain.nodes.filter((node) => node.tier > floorTier).map((node) => node.tier)).size;
}

/**
 * The tiers this floor buys: every input of a made node that is itself at or
 * below the floor. Not simply "every node at the floor's tier" — three P4
 * schematics consume a P1 directly, so a P2 floor buys that P1 too.
 */
export function sourcedIdsFor(chain: PiChain, floor: SourcingFloor): number[] {
  const floorTier = FLOOR_TIER[floor];
  const byId = nodeIndex(chain);
  const target = byId.get(chain.targetTypeId);
  if (!target) return [];
  const sourced = new Set<number>();
  const seen = new Set<number>();

  const walk = (node: ChainNode): void => {
    if (node.tier <= floorTier) {
      sourced.add(node.typeId);
      return;
    }
    if (seen.has(node.typeId)) return;
    seen.add(node.typeId);
    for (const input of node.inputs) {
      const child = byId.get(input.typeId);
      if (child) walk(child);
    }
  };
  walk(target);
  return [...sourced];
}

/** Type IDs this floor needs a price for and does not have — the target always among them if unpriced. */
export function missingPriceIds(
  chain: PiChain,
  floor: SourcingFloor,
  prices: Readonly<Record<number, number>>
): number[] {
  const needed = [chain.targetTypeId, ...sourcedIdsFor(chain, floor)];
  return [...new Set(needed)].filter((id) => {
    const price = prices[id];
    return price == null || !Number.isFinite(price);
  });
}

export interface UnpricedLine {
  typeId: number;
  name: string;
}

export type PlanCostResult =
  | { status: 'costed'; breakdown: ChainCostBreakdown }
  | {
      status: 'needs-extraction-rate';
      p0PerHour: readonly { typeId: number; name: string; unitsPerHour: number }[];
    }
  | { status: 'not-priceable'; missing: readonly UnpricedLine[] }
  | { status: 'floor-above-target' };

export interface CostPlanOptions {
  prices: Readonly<Record<number, number>>;
  sourcingFloor: SourcingFloor;
  layout: ChainLayout;
  taxRate: number;
  extractionRate?: number | null;
}

/** `chainCost`, with each way it can decline turned into a state a panel can render. */
export function costPlan(chain: PiChain, opts: CostPlanOptions): PlanCostResult {
  const byId = nodeIndex(chain);
  const target = byId.get(chain.targetTypeId);
  if (!target) return { status: 'floor-above-target' };
  if (FLOOR_TIER[opts.sourcingFloor] >= target.tier) return { status: 'floor-above-target' };

  const missing = missingPriceIds(chain, opts.sourcingFloor, opts.prices);
  if (missing.length > 0) {
    return {
      status: 'not-priceable',
      missing: missing.map((typeId) => ({
        typeId,
        name: byId.get(typeId)?.name ?? String(typeId),
      })),
    };
  }

  try {
    const result = chainCost(chain, {
      prices: opts.prices,
      sourcingFloor: opts.sourcingFloor,
      layout: opts.layout,
      taxRate: opts.taxRate,
      extractionRate: opts.extractionRate ?? null,
    });
    if (result.status === 'needs-extraction-rate') {
      return { status: 'needs-extraction-rate', p0PerHour: result.p0PerHour };
    }
    return { status: 'costed', breakdown: result };
  } catch {
    // A price the pre-check missed, or a graph the engine refuses: either way
    // the honest answer is no verdict, per CONTEXT.md round 29.
    return {
      status: 'not-priceable',
      missing: [{ typeId: chain.targetTypeId, name: target.name }],
    };
  }
}

export interface TaxSplit {
  /** Sourced tiers imported onto the planet that consumes them. */
  importBase: number;
  importCost: number;
  /** The finished product leaving the planet that made it. */
  exportBase: number;
  exportCost: number;
  /** Both sides of every made-to-made hop the layout puts a planet boundary on. Zero on one planet. */
  betweenPlanetsBase: number;
  betweenPlanetsCost: number;
}

/**
 * The three sides of the engine's single `taxBase`, per unit of the target.
 *
 * Import and export are computed from the same constants the engine charges
 * with; the between-planets share is what is left, which is what makes the sum
 * exact by construction rather than by a second implementation of the rule.
 */
export function taxSplit(breakdown: ChainCostBreakdown, targetTier: PiTier): TaxSplit {
  const importBase = breakdown.sourced.reduce(
    (sum, line) => sum + line.units * CUSTOMS_TAXABLE_VALUE[line.tier] * IMPORT_TAXABLE_FRACTION,
    0
  );
  const exportBase = CUSTOMS_TAXABLE_VALUE[targetTier];
  const betweenPlanetsBase = breakdown.taxBase - importBase - exportBase;
  const rate = breakdown.taxRate;
  return {
    importBase,
    importCost: importBase * rate,
    exportBase,
    exportCost: exportBase * rate,
    betweenPlanetsBase,
    betweenPlanetsCost: betweenPlanetsBase * rate,
  };
}

export interface PlanRow {
  typeId: number;
  name: string;
  tier: PiTier;
  /** Units this tier must supply per hour to sustain the target rate. */
  unitsPerHour: number;
  /** Null on P0, which is extracted rather than produced. */
  factoryPins: number | null;
  unitPrice: number | null;
  /** What the chosen floor does with this tier. */
  role: 'make' | 'buy';
  /**
   * ISK an hour of this tier's processing adds at hub prices: its own output
   * value less its inputs'. Null when it has no inputs, or when any price in
   * that comparison is missing — never zero, which would read as "adds
   * nothing".
   */
  valueAddPerHour: number | null;
  /**
   * What the market says about that tier, independent of the floor: `make`
   * when processing adds value, `buy` when the inputs cost more than the
   * output fetches. Null when unpriceable.
   */
  read: 'make' | 'buy' | null;
}

/**
 * One row per tier the chosen floor actually involves, target first then
 * descending. Tiers below the floor are omitted rather than shown at zero:
 * buying P1 means the P0 beneath it is never incurred at all.
 */
export function planRows(
  chain: PiChain,
  floor: SourcingFloor,
  prices: Readonly<Record<number, number>>
): PlanRow[] {
  const floorTier = FLOOR_TIER[floor];
  const sourced = new Set(sourcedIdsFor(chain, floor));

  const priceOf = (id: number): number | null => {
    const price = prices[id];
    return price != null && Number.isFinite(price) ? price : null;
  };

  return chain.nodes
    .filter((node) => node.tier > floorTier || sourced.has(node.typeId))
    .map((node) => {
      const unitPrice = priceOf(node.typeId);
      const outputPerCycle = node.outputPerCycle;
      let valueAddPerHour: number | null = null;
      if (unitPrice !== null && outputPerCycle != null && node.inputs.length > 0) {
        let inputCost = 0;
        let priced = true;
        for (const input of node.inputs) {
          const inputPrice = priceOf(input.typeId);
          if (inputPrice === null) {
            priced = false;
            break;
          }
          inputCost += (node.unitsPerHour * input.quantityPerCycle * inputPrice) / outputPerCycle;
        }
        if (priced) valueAddPerHour = node.unitsPerHour * unitPrice - inputCost;
      }
      return {
        typeId: node.typeId,
        name: node.name,
        tier: node.tier,
        unitsPerHour: node.unitsPerHour,
        factoryPins: node.tier > floorTier ? node.factoryPins : null,
        unitPrice,
        role: node.tier > floorTier ? ('make' as const) : ('buy' as const),
        valueAddPerHour,
        read: valueAddPerHour === null ? null : valueAddPerHour > 0 ? 'make' : 'buy',
      };
    });
}

export type SensitivityCell =
  | { rate: number; status: 'costed'; margin: number; best: boolean }
  | { rate: number; status: 'needs-extraction-rate' | 'not-priceable'; best: false };

export interface SensitivityRow {
  floor: SourcingFloor;
  factoryPins: number;
  planetCount: number;
  /** Extractor programs the P0 floor needs; null on every other floor and without a rate. */
  extractors: number | null;
  cells: SensitivityCell[];
}

export interface SensitivityOptions {
  prices: Readonly<Record<number, number>>;
  floors: readonly SourcingFloor[];
  rates: readonly number[];
  layout: ChainLayout;
  extractionRate?: number | null;
}

/**
 * Margin per floor across a spread of customs rates, with each floor's
 * footprint beside it.
 *
 * A floor per row rather than per column, because the footprint belongs next
 * to the margins it buys — and because that is the orientation that survives
 * `DataTable`'s stacking on a phone, where a matrix does not.
 */
export function sensitivityGrid(chain: PiChain, opts: SensitivityOptions): SensitivityRow[] {
  const rows: SensitivityRow[] = opts.floors.map((floor) => ({
    floor,
    factoryPins: factoryPinsAbove(chain, floor),
    planetCount: planetCountFor(chain, floor, opts.layout),
    extractors: null,
    cells: opts.rates.map((rate) => {
      const result = costPlan(chain, {
        prices: opts.prices,
        sourcingFloor: floor,
        layout: opts.layout,
        taxRate: rate,
        extractionRate: opts.extractionRate,
      });
      if (result.status === 'costed') {
        return { rate, status: 'costed' as const, margin: result.breakdown.margin, best: false };
      }
      return {
        rate,
        status:
          result.status === 'needs-extraction-rate' ? 'needs-extraction-rate' : 'not-priceable',
        best: false as const,
      };
    }),
  }));

  for (const row of rows) {
    if (row.floor !== 'P0') continue;
    const costed = costPlan(chain, {
      prices: opts.prices,
      sourcingFloor: 'P0',
      layout: opts.layout,
      taxRate: opts.rates[0] ?? 0,
      extractionRate: opts.extractionRate,
    });
    if (costed.status === 'costed') {
      row.extractors = costed.breakdown.extraction?.totalExtractors ?? null;
    }
  }

  opts.rates.forEach((_rate, index) => {
    let bestRow: SensitivityRow | null = null;
    let bestMargin = -Infinity;
    for (const row of rows) {
      const cell = row.cells[index];
      if (cell?.status !== 'costed') continue;
      if (cell.margin > bestMargin) {
        bestMargin = cell.margin;
        bestRow = row;
      }
    }
    const winning = bestRow?.cells[index];
    if (winning && winning.status === 'costed') winning.best = true;
  });

  return rows;
}
