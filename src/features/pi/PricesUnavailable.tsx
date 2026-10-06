import { useTranslation } from 'react-i18next';

/**
 * The one "prices unavailable" notice, shared by Plan, Map and Colonies. Prices
 * that could not be read are unknown, never zero: a tab shows this and hides
 * every figure that derives from them, rather than drawing "0 ISK".
 */
export function PricesUnavailable() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="rounded-sm border border-warning/45 bg-warning/10 px-4 py-3 text-sm"
    >
      <p className="font-semibold text-warning">{t('piPlan.pricesFailedTitle')}</p>
      <p className="mt-1 text-xs text-text-dim">{t('piPlan.pricesFailedHint')}</p>
    </div>
  );
}
