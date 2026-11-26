import { sumBrokerFees, sumMargins, type MarginTotal } from '@/engine/market/tradingProfit';
import type { MarginGap, RealizedMargin } from '@/engine/market/realizedMargin';
import type { WalletTransaction } from '@/esi/endpoints';
import type { WalletTransactionFilter } from '@/features/character/walletTransactionFilter';

export interface TradingSummary extends MarginTotal {
  brokerFees: number;
  archiveSince: number | null;
  uncosted: { sales: number; revenue: number };
}

interface FeeLine {
  ref_type: string;
  amount?: number;
  date: string;
}

export function tradingWindow(
  filter: Pick<WalletTransactionFilter, 'startDate' | 'endDate'>,
  fills: readonly Pick<WalletTransaction, 'date'>[]
): { fromMs: number | null; toMs: number } {
  let fromMs: number | null = null;
  if (filter.startDate !== null) fromMs = Date.parse(`${filter.startDate}T00:00:00Z`);
  else {
    for (const fill of fills) {
      const at = Date.parse(fill.date.slice(0, 10) + 'T00:00:00Z');
      if (fromMs === null || at < fromMs) fromMs = at;
    }
  }
  const toMs =
    filter.endDate !== null
      ? Date.parse(`${filter.endDate}T23:59:59.999Z`)
      : Number.POSITIVE_INFINITY;
  return { fromMs, toMs };
}

const NO_GAPS: ReadonlyMap<number, MarginGap> = new Map();

export function summarizeTrading(
  shown: readonly WalletTransaction[],
  margins: ReadonlyMap<number, RealizedMargin>,
  journal: readonly FeeLine[],
  filter: Pick<WalletTransactionFilter, 'startDate' | 'endDate'>,
  archiveSinceMs: number | null,
  gaps: ReadonlyMap<number, MarginGap> = NO_GAPS
): TradingSummary {
  const fills = shown.map((t) => ({
    transactionId: t.transaction_id,
    date: t.date,
    typeId: t.type_id,
    isBuy: t.is_buy,
  }));
  const { fromMs, toMs } = tradingWindow(filter, shown);
  const total = sumMargins(fills, margins);
  const uncosted = { sales: 0, revenue: 0 };
  for (const t of shown) {
    if (t.is_buy || !gaps.has(t.transaction_id)) continue;
    uncosted.sales += 1;
    uncosted.revenue += t.quantity * t.unit_price;
  }
  return {
    ...total,
    uncosted,
    brokerFees: fromMs === null ? 0 : sumBrokerFees(journal, fromMs, toMs),
    archiveSince:
      archiveSinceMs !== null && fromMs !== null && archiveSinceMs > fromMs ? archiveSinceMs : null,
  };
}
