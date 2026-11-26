import { useTranslation } from 'react-i18next';
import { isPriceFlagged, isPriceSpike } from '@/engine/market/priceVsMedian';
import { formatVsMedianPct } from '@/features/market/format';

export function PriceVsMedianFlag({ pct }: { pct: number | null | undefined }) {
  const { t } = useTranslation();
  if (pct == null || !isPriceFlagged(pct)) return null;
  const spike = isPriceSpike(pct);
  return (
    <span className={spike ? 'text-xs text-warning' : 'text-xs text-text-dim'}>
      {t(spike ? 'piPlan.vs90dSpike' : 'piPlan.vs90dDrop', { pct: formatVsMedianPct(pct) })}
    </span>
  );
}
