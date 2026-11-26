import { useTranslation } from 'react-i18next';
import { LiveStatus } from '@/components/ui';
import { useOnline } from '@/stores/network';
import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';

export function PricesUnavailable() {
  const { t } = useTranslation();
  const online = useOnline();
  const pricesUnavailableLabel = usePricesUnavailableLabel();
  return (
    <div className="rounded-xs border border-warning/45 bg-warning/10 px-4 py-3 text-sm">
      <LiveStatus>{pricesUnavailableLabel}</LiveStatus>
      <p className="font-semibold text-warning">{pricesUnavailableLabel}</p>
      <p className="mt-1 text-xs text-text-dim">
        {online ? t('piPlan.pricesFailedHint') : t('piPlan.pricesFailedOfflineHint')}
      </p>
    </div>
  );
}
