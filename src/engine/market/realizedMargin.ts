/**
 * Realized margin: what each personal sale in the wallet window actually made,
 * priced against the character's own wallet buys (issue #1740).
 *
 * The same FIFO lot walk as `walletCostBasis`: personal buys of a type are
 * lots, oldest first, and each personal sale uses up the oldest units left.
 * A sale's unit cost is the weighted average of the units it used up. A sale
 * gets a margin only when its sales tax line was found and every unit it sold
 * is covered by an earlier wallet buy — a sold build or a sale whose tax is
 * missing gets nothing, never a zero-cost or tax-free figure. One sale of a
 * type outrunning its buys proves stock the wallet never saw, which FIFO could
 * have put into any sale of it, so that type gets no margins at all (as
 * `walletCostBasis` reports `historyShort`). Broker fees carry no key to a
 * sale, so the margin is before them.
 *
 * Pure: other types' trades and corp trades are ignored here.
 */
import type { WalletTrade } from './walletCostBasis';

export interface RealizedMargin {
  /** Weighted average cost of the units the sale used up. */
  unitCost: number;
  /** The sale's sales tax, as a positive ISK amount. */
  salesTax: number;
  /** Sale total, less the units' cost and the sales tax. */
  margin: number;
}

interface Lot {
  unitPrice: number;
  remaining: number;
}

/**
 * Margin per sale, keyed by transaction id. `salesTaxByTransactionId` holds
 * each sale's sales tax as a positive amount; a sale absent from it gets no
 * margin.
 */
export function realizedMargins(
  transactions: readonly WalletTrade[],
  salesTaxByTransactionId: ReadonlyMap<number, number>
): Map<number, RealizedMargin> {
  const result = new Map<number, RealizedMargin>();
  const trades = transactions
    .filter((t) => t.isPersonal && t.quantity > 0)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.transactionId - b.transactionId);

  const lotsByType = new Map<number, { lots: Lot[]; head: number }>();
  const typeBySale = new Map<number, number>();
  const outranTypes = new Set<number>();
  for (const trade of trades) {
    let book = lotsByType.get(trade.typeId);
    if (!book) {
      book = { lots: [], head: 0 };
      lotsByType.set(trade.typeId, book);
    }
    if (trade.isBuy) {
      book.lots.push({ unitPrice: trade.unitPrice, remaining: trade.quantity });
      continue;
    }
    let toSell = trade.quantity;
    let cost = 0;
    while (toSell > 0 && book.head < book.lots.length) {
      const lot = book.lots[book.head];
      const taken = Math.min(lot.remaining, toSell);
      lot.remaining -= taken;
      toSell -= taken;
      cost += taken * lot.unitPrice;
      if (lot.remaining === 0) book.head += 1;
    }
    if (toSell > 0) {
      outranTypes.add(trade.typeId);
      continue;
    }
    const salesTax = salesTaxByTransactionId.get(trade.transactionId);
    if (salesTax === undefined) continue;
    typeBySale.set(trade.transactionId, trade.typeId);
    result.set(trade.transactionId, {
      unitCost: cost / trade.quantity,
      salesTax,
      margin: trade.quantity * trade.unitPrice - cost - salesTax,
    });
  }
  for (const [transactionId, typeId] of typeBySale) {
    if (outranTypes.has(typeId)) result.delete(transactionId);
  }
  return result;
}
