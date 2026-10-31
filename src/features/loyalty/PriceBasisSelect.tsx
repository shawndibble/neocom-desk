import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import type { PriceBasis } from '@/features/loyalty/priceBasis';

/**
 * The LP Store's revenue-basis select, shared by the store modal's and the
 * landing's filter rows.
 *
 * Radix, not `NativeSelect`: the trigger shows "Sell"/"Buy", the open list
 * spells out each basis; a native option has one text for both.
 */
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
      {/*
        An `aria-label` on the trigger ends name computation, so nothing
        inside it is ever announced — including the selection. The visible
        text is deliberately short here, so the label carries the long form
        and the current basis itself.
      */}
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
