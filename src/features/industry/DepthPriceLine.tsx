import { useTranslation } from 'react-i18next';
import type { DepthPrice } from '@/engine/industry/depthPrice';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatIsk, formatIskCompact } from '@/lib/isk';

function depthIsk(value: number): string {
  return Math.abs(value) >= 1_000_000 ? formatIskCompact(value) : formatIsk(value, 2);
}

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
