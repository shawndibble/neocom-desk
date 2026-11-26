import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';

export function EsiDidntAnswer({
  onRetry,
  retrying = false,
}: {
  onRetry: () => void;
  retrying?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xs border border-warning/45 bg-warning/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="font-semibold text-warning">{t('piPlan.esiFailedTitle')}</p>
        <p className="mt-1 text-xs text-text-dim">{t('piPlan.esiFailedHint')}</p>
      </div>
      <Button size="md" className="shrink-0" loading={retrying} onClick={onRetry}>
        {t('piPlan.esiRetry')}
      </Button>
    </div>
  );
}
