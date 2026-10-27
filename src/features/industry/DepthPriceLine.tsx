import { useTranslation } from 'react-i18next';
import type { DepthPrice } from '@/engine/industry/depthPrice';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatIsk, formatIskCompact } from '@/lib/isk';

/**
 * Shorthand from 1M up (a blueprint's "1.5B", which otherwise grows the cell),
 * cents below, where a material's 4,512.30 vs 4,498.10 is the difference.
 */
function depthIsk(value: number): string {
  return Math.abs(value) >= 1_000_000 ? formatIskCompact(value) : formatIsk(value, 2);
}

/**
 * A walked material's Price-cell second line: the lowest sell
 * beside the average the row is costed at, or a warning when the hub lists
 * fewer units than the plan needs.
 */
export function DepthPriceLine({ depth }: { depth: DepthPrice }) {
  const { t } = useTranslation();
  if (!depth.covered) {
    return (
      <span className="text-[0.6875rem] whitespace-nowrap text-warning tabular-nums">
        {t('industry.depthPriceShort', { listed: formatCompactNumber(depth.listed) })}
      </span>
    );
  }
  return (
    <span className="text-[0.6875rem] whitespace-nowrap text-text-dim tabular-nums">
      {t('industry.depthPriceLine', {
        best: depthIsk(depth.best),
        avg: depthIsk(depth.avg),
        need: formatCompactNumber(depth.need),
      })}
    </span>
  );
}
