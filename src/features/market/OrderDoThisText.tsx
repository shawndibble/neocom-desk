/**
 * The fix list's "Do this" cell: `orderDoThis`'s call in words, the exact
 * price as a `CopyablePrice` when there is one. The phone card passes
 * `interactive={false}`: its whole row is a `<button>`, which a copy button
 * cannot sit inside, so the price shows as plain text there.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMarketIsk } from '@/lib/isk';
import { CopyablePrice } from './CopyablePrice';
import type { OrderBadgeChoice } from './orderBadgeKind';
import type { OrderDoThis } from './orderDoThis';

export function OrderDoThisText({
  call,
  badge,
  interactive = true,
}: {
  call: OrderDoThis;
  /** The row's badge: its action text is the fallback call. */
  badge: OrderBadgeChoice | null;
  interactive?: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
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
