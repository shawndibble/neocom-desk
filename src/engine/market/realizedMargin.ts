import { parseInstant } from '../esiInstant';
import type { WalletTrade } from './walletCostBasis';

export interface RealizedMargin {
  unitCost: number;
  salesTax: number;
  margin: number;
}

interface Lot {
  unitPrice: number;
  remaining: number;
}

export type MarginGap = 'noBuy' | 'outside' | 'noTax';

export interface RealizedMarginReport {
  margins: Map<number, RealizedMargin>;
  gaps: Map<number, MarginGap>;
}

export function realizedMargins(
  transactions: readonly WalletTrade[],
  salesTaxByTransactionId: ReadonlyMap<number, number>
): Map<number, RealizedMargin> {
  return realizedMarginReport(transactions, salesTaxByTransactionId).margins;
}

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
