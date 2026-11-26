import { parseInstant } from '../esiInstant';

export interface WalletTrade {
  transactionId: number;
  date: string;
  typeId: number;
  quantity: number;
  unitPrice: number;
  isBuy: boolean;
  isPersonal: boolean;
}

export interface ProductionLot {
  date: string;
  typeId: number;
  quantity: number;
  unitCost: number;
}

export interface WalletCostBasisInput {
  transactions: readonly WalletTrade[];
  productionLots?: readonly ProductionLot[];
  typeId: number;
  pool: number;
  truncated?: boolean;
}

export type WalletCostBasisResult =
  | {
      status: 'covered';
      unitCost: number;
      unitsCovered: number;
      buyCount: number;
      oldestBuy: string;
      newestBuy: string;
      buys: WalletBuyUsed[];
      truncated: boolean;
    }
  | { status: 'partial'; coveredUnits: number; pool: number; truncated: boolean }
  | { status: 'historyShort'; truncated: boolean };

export interface WalletBuyUsed {
  date: string;
  quantity: number;
  unitPrice: number;
}

interface Lot {
  date: string;
  unitPrice: number;
  remaining: number;
}

export function walletCostBasis(input: WalletCostBasisInput): WalletCostBasisResult | null {
  const { typeId, pool } = input;
  const truncated = input.truncated ?? false;
  if (!(pool > 0)) return null;

  const fills = input.transactions
    .filter((t) => t.isPersonal && t.typeId === typeId && t.quantity > 0)
    .map((t) => ({ ...t, id: t.transactionId }));
  const runs = (input.productionLots ?? [])
    .filter((l) => l.typeId === typeId && l.quantity > 0)
    .map((l) => ({
      id: -1,
      date: l.date,
      quantity: l.quantity,
      unitPrice: l.unitCost,
      isBuy: true,
    }));
  const trades = [...fills, ...runs]
    .flatMap((t) => {
      const at = parseInstant(t.date);
      return at === null ? [] : [{ t, at }];
    })
    .sort((a, b) => a.at - b.at || a.t.id - b.t.id)
    .map(({ t }) => t);

  const lots: Lot[] = [];
  let head = 0;
  let unmatchedSell = false;
  for (const trade of trades) {
    if (trade.isBuy) {
      lots.push({ date: trade.date, unitPrice: trade.unitPrice, remaining: trade.quantity });
      continue;
    }
    let toSell = trade.quantity;
    while (toSell > 0 && head < lots.length) {
      const lot = lots[head];
      const taken = Math.min(lot.remaining, toSell);
      lot.remaining -= taken;
      toSell -= taken;
      if (lot.remaining === 0) head += 1;
    }
    if (toSell > 0) unmatchedSell = true;
  }

  if (unmatchedSell) return { status: 'historyShort', truncated };

  const left = lots.slice(head);
  const available = left.reduce((sum, lot) => sum + lot.remaining, 0);
  if (available < pool) return { status: 'partial', coveredUnits: available, pool, truncated };

  let needed = pool;
  let cost = 0;
  const buys: WalletBuyUsed[] = [];
  let oldestBuy = '';
  let newestBuy = '';
  for (let i = left.length - 1; i >= 0 && needed > 0; i--) {
    const taken = Math.min(left[i].remaining, needed);
    needed -= taken;
    cost += taken * left[i].unitPrice;
    buys.push({ date: left[i].date, quantity: taken, unitPrice: left[i].unitPrice });
    if (newestBuy === '') newestBuy = left[i].date;
    oldestBuy = left[i].date;
  }
  return {
    status: 'covered',
    unitCost: cost / pool,
    unitsCovered: pool,
    buyCount: buys.length,
    oldestBuy,
    newestBuy,
    buys,
    truncated,
  };
}
