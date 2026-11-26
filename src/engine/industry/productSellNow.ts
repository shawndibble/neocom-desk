import { ownedStockSale } from '@/engine/industry/ownedStockSale';
import type { HubPrices, SkillLevels } from '@/engine/industry/types';
import type { ResolvedStandings } from '@/engine/market/standings';

export interface ProductSellNowInput {
  productTypeID: number;
  productQuantity: number;
  hubBuyPrices: HubPrices;
  skills: SkillLevels;
  totalCost: number;
  forgone?: number;
  standing?: ResolvedStandings;
}

export interface ProductSellNow {
  unitPrice: number;
  quantity: number;
  gross: number;
  salesTax: number;
  net: number;
  forgone: number;
  profit: number;
}

export function productSellNow({
  productTypeID,
  productQuantity,
  hubBuyPrices,
  skills,
  totalCost,
  forgone = 0,
  standing,
}: ProductSellNowInput): ProductSellNow | null {
  if (productQuantity <= 0) return null;
  const sale = ownedStockSale(
    [
      {
        typeID: productTypeID,
        baseQuantity: productQuantity,
        quantity: productQuantity,
        ownedQuantity: productQuantity,
        remainingQuantity: 0,
        unitPrice: null,
        lineCost: 0,
        unpriced: false,
      },
    ],
    hubBuyPrices,
    'instant',
    skills,
    standing
  );
  const line = sale.lines[0];
  if (!line) return null;
  return {
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    gross: line.gross,
    salesTax: line.salesTax,
    net: line.net,
    forgone,
    profit: line.net - totalCost - forgone,
  };
}
