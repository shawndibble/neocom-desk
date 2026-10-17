import { useTranslation } from 'react-i18next';
import type { DepthPrice } from '@/engine/industry/depthPrice';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatIsk } from '@/lib/isk';

/**
 * A walked material's Price-cell second line (issue #3993): the lowest sell
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
        best: formatIsk(depth.best, 2),
        avg: formatIsk(depth.avg, 2),
        need: formatCompactNumber(depth.need),
      })}
    </span>
  );
}
