import { useTranslation } from 'react-i18next';
import {
  InfoTooltip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SegmentedControl,
} from '@/components/ui';
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
    return (
      <SegmentedControl
        label={t('market.sections.historyViews')}
        options={[
          { value: 'history', label: t('market.sections.historyOrders') },
          { value: 'transactions', label: t('market.sections.transactions') },
        ]}
        value={value}
        onChange={onChange}
        fill
        className="min-w-0 flex-1"
      />
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
