import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  IconButton,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { StationOrder } from '@/features/character/walletTransactionFilter';

const OPTIONS: readonly { order: StationOrder; label: string }[] = [
  { order: 'recent', label: 'wallet.stationsByRecent' },
  { order: 'net', label: 'wallet.stationsByNet' },
  { order: 'name', label: 'wallet.stationsByName' },
  { order: 'trades', label: 'wallet.stationsByTrades' },
];

/**
 * Orders the By station view's groups. A sort, not a filter, so it is its own
 * icon button beside the funnel rather than a field inside it; it applies the
 * moment a choice is made. Rows inside a group keep the column sort.
 */
export function StationSortMenu({
  value,
  onChange,
}: {
  value: StationOrder;
  onChange: (order: StationOrder) => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton icon={<Icon.Sort />} label={t('wallet.stationsByLabel')} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as StationOrder)}
        >
          {OPTIONS.map(({ order, label }) => (
            <DropdownMenuRadioItem key={order} value={order}>
              {t(label)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
