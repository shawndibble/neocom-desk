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
import { parseInstant } from '../esiInstant';
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
 * Why a personal sale has no margin, as the engine decides it:
 * - `noBuy`: the wallet buys before it don't cover every unit sold.
 * - `outside`: covered, but another sale of the item outran its buys, so which
 *   stock this one used can't be told.
 * - `noTax`: covered, but its sales tax line wasn't found.
 */
export type MarginGap = 'noBuy' | 'outside' | 'noTax';

export interface RealizedMarginReport {
  margins: Map<number, RealizedMargin>;
  /** Every personal sale without a margin, with the reason; a sale with a margin is absent. */
  gaps: Map<number, MarginGap>;
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
  return realizedMarginReport(transactions, salesTaxByTransactionId).margins;
}

/** `realizedMargins` plus the reason each personal sale without a margin has none. */
export function realizedMarginReport(
  transactions: readonly WalletTrade[],
  salesTaxByTransactionId: ReadonlyMap<number, number>
): RealizedMarginReport {
  const result = new Map<number, RealizedMargin>();
  const gaps = new Map<number, MarginGap>();
  const trades = transactions
    .filter((t) => t.isPersonal && t.quantity > 0)
    .flatMap((t) => {
      const at = parseInstant(t.date);
      return at === null ? [] : [{ t, at }];
    })
    .sort((a, b) => a.at - b.at || a.t.transactionId - b.t.transactionId)
    .map(({ t }) => t);

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
      gaps.set(trade.transactionId, 'noBuy');
      continue;
    }
    typeBySale.set(trade.transactionId, trade.typeId);
    const salesTax = salesTaxByTransactionId.get(trade.transactionId);
    if (salesTax === undefined) {
      gaps.set(trade.transactionId, 'noTax');
      continue;
    }
    result.set(trade.transactionId, {
      unitCost: cost / trade.quantity,
      salesTax,
      margin: trade.quantity * trade.unitPrice - cost - salesTax,
    });
  }
  for (const [transactionId, typeId] of typeBySale) {
    if (!outranTypes.has(typeId)) continue;
    result.delete(transactionId);
    gaps.set(transactionId, 'outside');
  }
  return { margins: result, gaps };
}
