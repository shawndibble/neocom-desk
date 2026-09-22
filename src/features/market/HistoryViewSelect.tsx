import { useTranslation } from 'react-i18next';
import {
  InfoTooltip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';

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
 *
 * Below `sm` it is a two-button toggle instead: with only two options, one
 * tap beats open-then-pick, and the toggle fills the header row the phone
 * layout gives it. Still inside the panel's own header, so it still reads as
 * a view of this table rather than a second row of tabs.
 */
export function HistoryViewSelect({ value, onChange }: HistoryViewSelectProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  if (isPhone) {
    const option = (view: HistoryView, label: string) => (
      <button
        type="button"
        aria-pressed={value === view}
        onClick={() => onChange(view)}
        className={cx(
          'min-h-11 flex-1 basis-0 rounded-xs border text-[0.6875rem] font-semibold tracking-widest uppercase focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
          value === view
            ? 'border-line-bright bg-panel text-text'
            : 'border-transparent text-text-dim hover:text-text'
        )}
      >
        {label}
      </button>
    );
    return (
      <span
        role="group"
        aria-label={t('market.sections.historyViews')}
        className="flex min-w-0 flex-1 gap-0.5 rounded-xs border border-line bg-panel-2 p-px"
      >
        {option('history', t('market.sections.historyOrders'))}
        {option('transactions', t('market.sections.transactions'))}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <Select value={value} onValueChange={(value) => onChange(value as HistoryView)}>
        <SelectTrigger size="sm" className="w-32" aria-label={t('market.sections.historyViews')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="history">{t('market.sections.historyOrders')}</SelectItem>
          <SelectItem value="transactions">{t('market.sections.transactions')}</SelectItem>
        </SelectContent>
      </Select>
      <InfoTooltip
        label={t('market.sections.historyViewsTooltipLabel')}
        content={t('market.sections.historyViewsTooltip')}
      />
    </span>
  );
}
