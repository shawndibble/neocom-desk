import { formatTimestamp } from '@/lib/timestamp';
import type { WalletBalancePoint } from '@/engine/wallet/balanceHistory';

export interface ChartPoint extends WalletBalancePoint {
  /** Epoch ms of `date` � the numeric time axis plots by this. */
  x: number;
  tooltipLabel: string;
}

/** Places each journal entry by its timestamp, not its index. */
export function toChartPoints(points: WalletBalancePoint[], timeZone?: string): ChartPoint[] {
  return points.map((p) => ({
    ...p,
    x: Date.parse(p.date),
    tooltipLabel: formatTimestamp(new Date(p.date), timeZone),
  }));
}
