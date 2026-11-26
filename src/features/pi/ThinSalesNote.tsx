import { useTranslation } from 'react-i18next';
import type { ThinSales } from '@/engine/pi/salesCap';
import { formatCount } from '@/lib/formatCount';

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
