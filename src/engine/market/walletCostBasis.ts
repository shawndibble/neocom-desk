/**
 * Wallet Cost Basis: what a character's unlinked sell orders of one type
 * cost, worked out FIFO from their own wallet transactions (issue #1422).
 *
 * Personal buys of the type are lots, oldest first; personal sells consume
 * them oldest first. The unit cost is the weighted average of the *newest*
 * `pool` units still left — the pool being the units the character has on
 * open sell orders — with a lot split at the boundary prorated. A basis is
 * only offered when the history actually covers every unit; a shortfall is
 * reported as `partial` or `historyShort` rather than guessed.
 *
 * Pure: the caller need not pre-filter — other types and corp trades are
 * ignored here.
 */
export interface WalletTrade {
  transactionId: number;
  /** ISO timestamp. */
  date: string;
  typeId: number;
  quantity: number;
  unitPrice: number;
  isBuy: boolean;
  isPersonal: boolean;
}

export interface WalletCostBasisInput {
  transactions: readonly WalletTrade[];
  typeId: number;
  /** Units on the character's unlinked sell orders of this type. */
  pool: number;
  /** The wallet fetch stopped at its page cap, so older history may exist. */
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
      truncated: boolean;
    }
  | { status: 'partial'; coveredUnits: number; pool: number; truncated: boolean }
  | { status: 'historyShort'; truncated: boolean };

interface Lot {
  date: string;
  unitPrice: number;
  remaining: number;
}

export function walletCostBasis(input: WalletCostBasisInput): WalletCostBasisResult | null {
  const { typeId, pool } = input;
  const truncated = input.truncated ?? false;
  if (!(pool > 0)) return null;

  const trades = input.transactions
    .filter((t) => t.isPersonal && t.typeId === typeId && t.quantity > 0)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.transactionId - b.transactionId);

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
  let buyCount = 0;
  let oldestBuy = '';
  let newestBuy = '';
  for (let i = left.length - 1; i >= 0 && needed > 0; i--) {
    const taken = Math.min(left[i].remaining, needed);
    needed -= taken;
    cost += taken * left[i].unitPrice;
    buyCount += 1;
    if (newestBuy === '') newestBuy = left[i].date;
    oldestBuy = left[i].date;
  }
  return {
    status: 'covered',
    unitCost: cost / pool,
    unitsCovered: pool,
    buyCount,
    oldestBuy,
    newestBuy,
    truncated,
  };
}
