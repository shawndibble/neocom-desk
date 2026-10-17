import { isPriceSpike } from '@/engine/market/priceVsMedian';
import { formatVsMedianPct } from '@/features/market/format';

/**
 * A "vs 90d" figure for the Build Opportunities tables: "+35%" in amber from
 * the spike threshold up, "−12%" plain, blank when the item traded on too few
 * days, and a dim "…" while its history is still being read.
 */
export function Vs90dFigure({ value }: { value: number | null | undefined }) {
  if (value === undefined) return <span className="text-text-dim">…</span>;
  if (value === null) return null;
  return (
    <span className={isPriceSpike(value) ? 'text-warning' : undefined}>
      {formatVsMedianPct(value)}
    </span>
  );
}
