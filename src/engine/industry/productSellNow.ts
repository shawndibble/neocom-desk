/**
 * A Build Plan's product sold straight into the hub's buy orders: the second
 * sale basis beside the headline's listed sell order (issue #5007). Priced by
 * the very rule the owned-materials Sell now uses (`ownedStockSale` on the
 * `instant` basis — highest buy, sales tax only, no broker fee), so the two
 * Sell now reads on one page cannot disagree.
 *
 * Top of book only: a large quantity may fill below the highest buy, and no
 * order-book depth is modelled.
 */

import { ownedStockSale } from '@/engine/industry/ownedStockSale';
import type { HubPrices, SkillLevels } from '@/engine/industry/types';

export interface ProductSellNowInput {
  productTypeID: number;
  /** Units the job yields. */
  productQuantity: number;
  /** The sale hub's highest buy per type. */
  hubBuyPrices: HubPrices;
  skills: SkillLevels;
  /** The plan's total cost: materials plus total job cost. */
  totalCost: number;
  /** On the sell-value basis, what the owned materials would net if sold instead. */
  forgone?: number;
}

export interface ProductSellNow {
  /** The hub's highest buy order for the product. */
  unitPrice: number;
  quantity: number;
  gross: number;
  salesTax: number;
  /** gross - salesTax. */
  net: number;
  /** The owned materials' forgone sale charged against it; 0 off the sell-value basis. */
  forgone: number;
  /** net - totalCost - forgone. */
  profit: number;
}

/** `null` when the hub has no buy order for the product, or the job yields nothing. */
export function productSellNow({
  productTypeID,
  productQuantity,
  hubBuyPrices,
  skills,
  totalCost,
  forgone = 0,
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
    skills
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
