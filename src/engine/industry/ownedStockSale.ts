/**
 * The other thing a player can do with the materials they already own: sell
 * them instead of consuming them.
 *
 * A Build Plan prices owned units at zero (see `sourcing.ts`), which is right
 * for "what does this job cost me in ISK today" and silent about the question
 * a miner actually asks — is my ore worth more sold than built with? This
 * module answers that by valuing the owned portion at the hub and comparing
 * those proceeds against what building and selling the product nets.
 *
 * Two ways to liquidate, and they are not the same money:
 * - `instant`: fill the standing buy orders. Sales tax only — filling someone
 *   else's order lists nothing, so no broker fee is charged.
 * - `order`: list your own sell order and wait. Sales tax plus the broker fee
 *   for placing it, at 100 ISK minimum per stack listed.
 *
 * Pure, like every `src/engine` module: the caller resolves which price map
 * belongs to which basis.
 */

import { brokerFee, salesTax } from '@/engine/industry/fees';
import { mergeCostLines } from '@/engine/industry/mergeCostLines';
import { SKILL_IDS } from '@/engine/industry/types';
import type { HubPrices, MaterialCostLine, SkillLevels } from '@/engine/industry/types';
import type { ResolvedStandings } from '@/engine/market/standings';

/** How the owned stock would be turned into ISK. */
export type LiquidationBasis = 'instant' | 'order';

/**
 * Drops the synthetic Blueprint Acquisition row (issue #838) — its
 * `acquisitionTier` marker is only ever set on that row — before a plan's
 * materials reach `ownedStockSale`. An owned BPO/BPC has no hub price to
 * sell at, so leaving it in would flag it `unpriced` and null out the whole
 * verdict for a "sale" that was never a real option: you don't sell the
 * blueprint you're using to build.
 */
export function sellableMaterials<T extends MaterialCostLine & { acquisitionTier?: unknown }>(
  materials: readonly T[]
): T[] {
  return materials.filter((material) => material.acquisitionTier === undefined);
}

/**
 * A resolved plan material, as far as the owned stock in it goes: the line
 * itself and, when it is built, the inputs its own job consumes.
 * `ResolvedMaterial` fits it; a test fixture does not need a whole sub-build.
 */
export interface OwnedStockNode extends MaterialCostLine {
  subBuild?: { inputs: readonly OwnedStockNode[] };
}

/**
 * Every owned unit a plan's resolved tree would consume, one line per type.
 * Owned stock is claimed wherever in the tree a material is used, so a
 * sub-build's inputs hold stock the top level never sees; this walks the
 * whole tree, so the sale prices what building would actually use up. One
 * type claimed in several branches merges into one stack: it would be
 * listed once, and the broker minimum bites once. Blueprint Acquisition rows
 * stay out at every depth, as `sellableMaterials` keeps them out of the top.
 */
export function ownedStockLines(materials: readonly OwnedStockNode[]): MaterialCostLine[] {
  const byType = new Map<number, MaterialCostLine>();
  const visit = (nodes: readonly OwnedStockNode[]) => {
    for (const node of sellableMaterials(nodes)) {
      if (node.ownedQuantity > 0) {
        const costLine: MaterialCostLine = {
          typeID: node.typeID,
          baseQuantity: node.baseQuantity,
          quantity: node.quantity,
          ownedQuantity: node.ownedQuantity,
          remainingQuantity: node.remainingQuantity,
          unitPrice: node.unitPrice,
          lineCost: node.lineCost,
          unpriced: node.unpriced,
        };
        const existing = byType.get(node.typeID);
        byType.set(node.typeID, existing ? mergeCostLines(existing, costLine) : costLine);
      }
      if (node.subBuild) visit(node.subBuild.inputs);
    }
  };
  visit(materials);
  return [...byType.values()];
}

/** Both sides of the sale hub's book: what a buy order pays, what a sell order asks. */
export interface SaleBooks {
  hubPrices: HubPrices;
  hubBuyPrices: HubPrices;
}

/**
 * What a plan's owned stock would fetch on `basis` — the one sale every
 * sell-value figure on a Build Plan reads (the verdict, Costs & revenue,
 * Break Even's trials), so none of them drifts from another. Sell-now fills
 * buy orders, so it reads the buy side; a listed order reads the sell side.
 */
export function planOwnedStockSale(
  materials: readonly OwnedStockNode[],
  books: SaleBooks,
  basis: LiquidationBasis,
  skills: SkillLevels,
  standing?: ResolvedStandings
): OwnedStockSale {
  const prices = basis === 'instant' ? books.hubBuyPrices : books.hubPrices;
  return ownedStockSale(ownedStockLines(materials), prices, basis, skills, standing);
}

export interface OwnedStockSaleLine {
  typeID: number;
  /** Owned units this job would consume — never more than the job needs. */
  quantity: number;
  /** Price per unit on the chosen side of the order book. */
  unitPrice: number;
  gross: number;
  salesTax: number;
  /** Always 0 on the `instant` basis. */
  brokerFee: number;
  net: number;
}

export interface OwnedStockSale {
  basis: LiquidationBasis;
  /** One line per material with owned units and a price; nothing owned means no line. */
  lines: OwnedStockSaleLine[];
  gross: number;
  salesTax: number;
  brokerFee: number;
  /** gross - salesTax - brokerFee: what actually reaches the wallet. */
  net: number;
  /** Materials with owned units but no price on this side of the book. */
  unpriced: number[];
  /** Owned units across every material, priced or not — the "is there stock at all" test. */
  ownedUnits: number;
}

/**
 * Value of the owned portion of a plan's materials if it were sold rather
 * than consumed. Materials with nothing owned are skipped entirely; owned
 * units with no price on the chosen side are counted in `unpriced` and
 * contribute no ISK, so a partial total is never passed off as complete.
 */
export function ownedStockSale(
  materials: readonly MaterialCostLine[],
  prices: HubPrices,
  basis: LiquidationBasis,
  skills: SkillLevels,
  /** The character's standing toward the sale hub's NPC owner. Absent/0 = standings assumed 0. */
  standing?: ResolvedStandings
): OwnedStockSale {
  const accounting = skills[SKILL_IDS.accounting] ?? 0;
  const brokerRelations = skills[SKILL_IDS.brokerRelations] ?? 0;

  const lines: OwnedStockSaleLine[] = [];
  const unpriced: number[] = [];
  let ownedUnits = 0;

  for (const material of materials) {
    if (material.ownedQuantity <= 0) continue;
    ownedUnits += material.ownedQuantity;

    const unitPrice = prices[material.typeID];
    if (unitPrice === undefined) {
      unpriced.push(material.typeID);
      continue;
    }

    const gross = material.ownedQuantity * unitPrice;
    const tax = salesTax(gross, accounting);
    // One order per material, so the 100 ISK minimum bites per stack listed —
    // which is exactly why listing a small stack can net less than filling a
    // buy order does.
    const broker =
      basis === 'order'
        ? brokerFee(
            gross,
            brokerRelations,
            standing?.factionStanding,
            standing?.corpStanding,
            standing?.brokerSurchargePct
          )
        : 0;
    lines.push({
      typeID: material.typeID,
      quantity: material.ownedQuantity,
      unitPrice,
      gross,
      salesTax: tax,
      brokerFee: broker,
      net: gross - tax - broker,
    });
  }

  const gross = lines.reduce((sum, l) => sum + l.gross, 0);
  const tax = lines.reduce((sum, l) => sum + l.salesTax, 0);
  const broker = lines.reduce((sum, l) => sum + l.brokerFee, 0);

  return {
    basis,
    lines,
    gross,
    salesTax: tax,
    brokerFee: broker,
    net: gross - tax - broker,
    unpriced,
    ownedUnits,
  };
}

export interface UseOrSellComparison {
  /** What building and selling the product nets, owned materials treated as free. */
  buildProfit: number;
  /** What the owned materials net if sold on this basis instead. */
  sellNet: number;
  /** buildProfit - sellNet. Positive means building is still the better use. */
  advantage: number;
  verdict: 'build' | 'sell';
}

/**
 * Whether consuming the owned stock beats selling it. The comparison is
 * direct — a Build Plan's profit already counts owned units as free, so the
 * proceeds forgone by consuming them are exactly what has to clear.
 *
 * `null` — no advice rather than bad advice — when the build has no profit
 * figure, when nothing is owned, or when any owned material has no price on
 * the chosen side: an understated sale total would tip the verdict toward
 * building for a reason that is missing data, not economics.
 */
export function compareUseOrSell(
  buildProfit: number | null,
  sale: OwnedStockSale
): UseOrSellComparison | null {
  if (buildProfit === null) return null;
  if (sale.ownedUnits <= 0 || sale.unpriced.length > 0) return null;

  const advantage = buildProfit - sale.net;
  return {
    buildProfit,
    sellNet: sale.net,
    advantage,
    verdict: advantage >= 0 ? 'build' : 'sell',
  };
}
