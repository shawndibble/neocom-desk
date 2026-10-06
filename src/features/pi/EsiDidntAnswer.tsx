import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';

/**
 * The one "ESI did not answer" notice, shared by Plan, Map and Colonies. The
 * colony list could not be read and nothing is cached: that is not "you have no
 * colonies" and not a login problem (`needsReauth` has its own banner), so a
 * tab shows this with a Retry instead of an empty state.
 */
export function EsiDidntAnswer({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-sm border border-warning/45 bg-warning/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="font-semibold text-warning">{t('piPlan.esiFailedTitle')}</p>
        <p className="mt-1 text-xs text-text-dim">{t('piPlan.esiFailedHint')}</p>
      </div>
      <Button size="md" className="shrink-0" onClick={onRetry}>
        {t('piPlan.esiRetry')}
      </Button>
    </div>
  );
}
