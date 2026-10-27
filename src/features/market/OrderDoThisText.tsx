/**
 * The fix list's "Do this": the row's call in words, the exact price as a
 * `CopyablePrice`. `interactive={false}` keeps the price plain text, for the
 * phone card's own `<button>`.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMarketIsk } from '@/lib/isk';
import { CopyablePrice } from './CopyablePrice';
import type { OpenOrderRow } from './openOrdersModel';
import { rowFixCall } from './orderDoThis';

export function OrderDoThisText({
  row,
  interactive = true,
}: {
  row: OpenOrderRow;
  interactive?: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  const {
    call,
    advice: { badge },
  } = rowFixCall(row);
  const priced = (text: string, price: number) =>
    interactive ? <CopyablePrice price={price}>{text}</CopyablePrice> : <span>{text}</span>;

  switch (call.kind) {
    case 'raisePrice':
      return call.price === null ? (
        <span>{t('market.orders.fixList.doThis.raisePrice')}</span>
      ) : (
        priced(
          t('market.orders.fixList.doThis.raisePriceTo', { price: formatMarketIsk(call.price) }),
          call.price
        )
      );
    case 'undercutTo':
      return priced(
        t('market.orders.fixList.doThis.undercutTo', { price: formatMarketIsk(call.price) }),
        call.price
      );
    case 'bid':
      return priced(
        t('market.orders.fixList.doThis.bid', { price: formatMarketIsk(call.price) }),
        call.price
      );
    case 'badgeAdvice':
      return badge ? <span>{t(`market.orders.badge.${badge.kind}Action`)}</span> : null;
    default:
      return <span>{t(`market.orders.fixList.doThis.${call.kind}`)}</span>;
  }
}
