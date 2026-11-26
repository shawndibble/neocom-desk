import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import type { PriceBasis } from '@/features/loyalty/priceBasis';

export function PriceBasisSelect({
  value,
  onValueChange,
}: {
  value: PriceBasis;
  onValueChange: (value: PriceBasis) => void;
}) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as PriceBasis)}>
      <SelectTrigger
        aria-label={`${t('loyaltyStore.priceBasisLabel')}: ${t(
          value === 'buy' ? 'loyaltyStore.priceBasisBuy' : 'loyaltyStore.priceBasisSell'
        )}`}
      >
        <SelectValue>
          {t(
            value === 'buy' ? 'loyaltyStore.priceBasisBuyShort' : 'loyaltyStore.priceBasisSellShort'
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="sell">{t('loyaltyStore.priceBasisSell')}</SelectItem>
        <SelectItem value="buy">{t('loyaltyStore.priceBasisBuy')}</SelectItem>
      </SelectContent>
    </Select>
  );
}
