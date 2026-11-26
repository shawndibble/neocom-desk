import { brokerFee, salesTax } from '@/engine/industry/fees';
import { mergeCostLines } from '@/engine/industry/mergeCostLines';
import { SKILL_IDS } from '@/engine/industry/types';
import type { HubPrices, MaterialCostLine, SkillLevels } from '@/engine/industry/types';
import type { ResolvedStandings } from '@/engine/market/standings';

export type LiquidationBasis = 'instant' | 'order';

export function sellableMaterials<T extends MaterialCostLine & { acquisitionTier?: unknown }>(
  materials: readonly T[]
): T[] {
  return materials.filter((material) => material.acquisitionTier === undefined);
}

export interface OwnedStockNode extends MaterialCostLine {
  subBuild?: { inputs: readonly OwnedStockNode[] };
}

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

export interface SaleBooks {
  hubPrices: HubPrices;
  hubBuyPrices: HubPrices;
}

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
  quantity: number;
  unitPrice: number;
  gross: number;
  salesTax: number;
  brokerFee: number;
  net: number;
}

export interface OwnedStockSale {
  basis: LiquidationBasis;
  lines: OwnedStockSaleLine[];
  gross: number;
  salesTax: number;
  brokerFee: number;
  net: number;
  unpriced: number[];
  ownedUnits: number;
}

export function ownedStockSale(
  materials: readonly MaterialCostLine[],
  prices: HubPrices,
  basis: LiquidationBasis,
  skills: SkillLevels,
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
    const tax = salesTax(gross, accounting, standing?.feeDiscountFactor);
    const broker =
      basis === 'order'
        ? brokerFee(
            gross,
            brokerRelations,
            standing?.factionStanding,
            standing?.corpStanding,
            standing?.safetyTaxPct,
            standing?.feeDiscountFactor
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
  buildProfit: number;
  sellNet: number;
  advantage: number;
  verdict: 'build' | 'sell';
}

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
