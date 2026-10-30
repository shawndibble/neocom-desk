import { useTranslation } from 'react-i18next';
import type { ThinSales } from '@/engine/pi/salesCap';
import { formatCount } from '@/lib/formatCount';

/**
 * The exception flag on a plan row whose output is over the share the hub
 * absorbs: a line of text, not a tooltip, so a phone sees it. Rows under the
 * share render nothing.
 */
export function ThinSalesNote({
  thin,
  regionName,
}: {
  thin: ThinSales | null;
  regionName: string;
}) {
  const { t } = useTranslation();
  if (!thin) return null;
  return (
    <p className="text-xs text-warning">
      {t('piPlan.thinSales', {
        plan: formatCount(Math.round(thin.planPerDay)),
        region: regionName,
        trades: formatCount(Math.round(thin.tradesPerDay)),
        pct: Math.round((thin.planPerDay / thin.tradesPerDay) * 100),
        counted: formatCount(Math.round(thin.countedPerDay)),
      })}
    </p>
  );
}
