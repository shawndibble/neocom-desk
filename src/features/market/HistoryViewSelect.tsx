import { useTranslation } from 'react-i18next';
import { InfoTooltip, NativeSelect } from '@/components/ui';

/** The two views behind the History tab. `history` is the one it opens on. */
export type HistoryView = 'history' | 'transactions';

interface HistoryViewSelectProps {
  value: HistoryView;
  onChange: (view: HistoryView) => void;
}

/**
 * Picks which of the History tab's two tables is showing, from inside that
 * table's own header.
 *
 * A select rather than a second row of tabs: these are two readings of the
 * same past, not two places to be, and tabs nested under tabs read as a
 * hierarchy that isn't there. The tooltip beside it carries the distinction
 * the two words don't — an order is what you asked for, a transaction is what
 * actually changed hands — because "Orders" and "Transactions" sound
 * interchangeable to anyone who hasn't hit the difference.
 */
export function HistoryViewSelect({ value, onChange }: HistoryViewSelectProps) {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-1">
      <NativeSelect
        size="sm"
        className="w-32"
        aria-label={t('market.sections.historyViews')}
        value={value}
        onChange={(e) => onChange(e.target.value as HistoryView)}
      >
        <option value="history">{t('market.sections.historyOrders')}</option>
        <option value="transactions">{t('market.sections.transactions')}</option>
      </NativeSelect>
      <InfoTooltip
        label={t('market.sections.historyViewsTooltipLabel')}
        content={t('market.sections.historyViewsTooltip')}
      />
    </span>
  );
}
