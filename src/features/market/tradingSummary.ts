/**
 * The Trading profit figures above Market History's table (issue #3995): the
 * margin of the sales shown, the broker fees paid over the same dates, and
 * whether the local wallet archive reaches back that far.
 *
 * Pure: the caller loads the journal and the archive coverage.
 */
import { sumBrokerFees, sumMargins, type MarginTotal } from '@/engine/market/tradingProfit';
import type { MarginGap, RealizedMargin } from '@/engine/market/realizedMargin';
import type { WalletTransaction } from '@/esi/endpoints';
import type { WalletTransactionFilter } from '@/features/character/walletTransactionFilter';

export interface TradingSummary extends MarginTotal {
  brokerFees: number;
  /** The archive starts after the range does: the figures cover only this far back. Epoch ms. */
  archiveSince: number | null;
  /** The sales shown that have no margin (a gap), and the ISK they brought in. */
  uncosted: { sales: number; revenue: number };
}

interface FeeLine {
  ref_type: string;
  amount?: number;
  date: string;
}

/** The dates the filter shows, as UTC ms: its start/end days, else the fills' own first day and open-ended. */
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

/**
 * `archiveSinceMs` is where the local wallet archive starts (null when it has
 * no history); it is reported only when it falls inside the range.
 */
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
