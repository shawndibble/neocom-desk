import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SegmentedControl,
} from '@/components/ui';
import { MD_UP_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { WALLET_RANGES, useWalletRange, type WalletRange } from './walletRange';

/**
 * The Wallet page's 7 / 30 / 90 day range, in the page header level with its
 * icon buttons: segmented buttons from `md`, a select below it, where three
 * segments would crowd the title and Character picker.
 */
export function WalletRangeControl() {
  const { t } = useTranslation();
  const wide = useMediaQuery(MD_UP_QUERY);
  const range = useWalletRange((state) => state.value);
  const setRange = useWalletRange((state) => state.setValue);
  const label = t('wallet.cashFlow.period');
  const dayLabel = (value: WalletRange) =>
    t('wallet.cashFlow.periodDays', { count: Number(value) });

  if (wide) {
    return (
      <SegmentedControl
        label={label}
        options={WALLET_RANGES.map((value) => ({ value, label: dayLabel(value) }))}
        value={range}
        onChange={(next) => void setRange(next)}
        uppercase={false}
      />
    );
  }
  return (
    <Select value={range} onValueChange={(next) => void setRange(next as WalletRange)}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {WALLET_RANGES.map((value) => (
          <SelectItem key={value} value={value}>
            {dayLabel(value)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
