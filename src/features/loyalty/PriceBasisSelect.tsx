import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import type { PriceBasis } from '@/features/loyalty/priceBasis';

/**
 * The LP Store's revenue-basis select, shared by the store modal's and the
 * landing's filter rows.
 *
 * Radix rather than `NativeSelect`, the one thing a real `<select>` can't do:
 * the trigger shows just "Sell"/"Buy" while the open list spells out what each
 * basis means. A native option's text is the same in both places, so the
 * closed box had to carry "(list order)" — twelve characters of explanation
 * sitting permanently in a filter row.
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
