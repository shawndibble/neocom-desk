import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';

/**
 * The LP store's trade hub select: one markup for the filter row and the
 * header gear, both writing the app-wide hub (`useMarketHub`).
 */
export function TradeHubSelect({
  value,
  onValueChange,
  id,
}: {
  value: TradeHub['id'];
  onValueChange: (hubId: TradeHub['id']) => void;
  id?: string;
}) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as TradeHub['id'])}>
      <SelectTrigger id={id} aria-label={t('loyaltyStore.hubLabel')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TRADE_HUBS.map((h) => (
          <SelectItem key={h.id} value={h.id}>
            {h.systemName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
