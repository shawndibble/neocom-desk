import { useTranslation } from 'react-i18next';
import { InfoTooltip } from '@/components/ui';
import { buttonClassName } from '@/components/ui/buttonClassName';
import { formatMarketIsk } from '@/lib/isk';
import { OpenInEveButton } from '@/features/openInEve/OpenInEveButton';
import { MarketOnly } from '@/features/abyssal/MarketOnly';
import type { OpenOrderRow } from './openOrdersModel';
import { OrderProblemBadge } from './OrderProblemBadge';
import { OrderRowSummaryText } from './OrderRowSummaryText';
import type { OrderAdvice } from './orderAdvice';
import { doThisPrice, rowFixCall } from './orderDoThis';
import { OrderDoThisText } from './OrderDoThisText';
import { bidTurnInPays } from './orderTurnIn';
import { isOffHubStation } from './hubStation';
import { CopyPriceButton } from './CopyablePrice';
import { MarketItemLink } from './MarketItemLink';
import { formatCount } from '@/lib/formatCount';

export function OrderDetailHeader({
  row,
  advice,
  copyPrice,
  isPhone,
}: {
  row: OpenOrderRow;
  advice: OrderAdvice;
  copyPrice: number | null;
  isPhone: boolean;
}) {
  const { t } = useTranslation();
  const { badge, summary, verdict } = advice;
  const { call: fixCall } = rowFixCall(row);
  const shortCall = doThisPrice(fixCall) === null && fixCall.kind !== 'badgeAdvice';
  const offHub = isOffHubStation(row.stationName, row.locationId);
  const actionKey =
    badge?.kind === 'topBid' && bidTurnInPays(row)
      ? 'market.orders.badge.topBidTurnInAction'
      : badge && `market.orders.badge.${badge.kind}Action`;

  return (
    <>
      <p className="text-sm text-text-dim">
        {row.characterName} · {row.stationName ?? t('market.unknownStructure')}
        {offHub && (
          <>
            {' · '}
            <span className="inline-flex items-center gap-1 text-warning">
              {t('market.orders.offHub')}
              <InfoTooltip
                label={t('common.aboutLabel', { label: t('market.orders.offHub') })}
                content={t('market.orders.offHubHelp')}
              />
            </span>
          </>
        )}
        {' · '}
        {t(row.isBuyOrder ? 'orders.buy' : 'orders.sell')} ·{' '}
        {t('market.orders.detail.unitsLeft', {
          remain: formatCount(row.volumeRemain),
          total: formatCount(row.volumeTotal),
        })}
      </p>

      <div>
        {badge && <OrderProblemBadge kind={badge.kind} detail={badge.detail} />}
        {verdict ? (
          <>
            <p className="mt-2 text-xl font-semibold text-text">
              {t(`market.orders.verdict.${verdict.kind}`, {
                price: verdict.price === null ? '' : formatMarketIsk(verdict.price),
              })}
            </p>
            <p className="mt-1 text-sm text-text-dim">
              {t(`market.orders.verdict.${verdict.kind}Detail`, {
                amount: verdict.amount === null ? '' : formatMarketIsk(verdict.amount),
                price: verdict.price === null ? '' : formatMarketIsk(verdict.price),
              })}
            </p>
          </>
        ) : shortCall ? (
          <>
            <p className="mt-2 text-xl font-semibold text-text">
              <OrderDoThisText row={row} interactive={false} />
            </p>
            {actionKey && <p className="mt-1 text-sm text-text-dim">{t(actionKey)}</p>}
            {summary && (
              <p className="mt-1">
                <OrderRowSummaryText row={row} summary={summary} />
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mt-2 text-base font-semibold text-text">
              {actionKey ? t(actionKey) : t('market.orders.scopeNotChecked')}
            </p>
            {summary && (
              <p className="mt-1">
                <OrderRowSummaryText row={row} summary={summary} />
              </p>
            )}
          </>
        )}
        {!isPhone && copyPrice !== null && (
          <div className="mt-3">
            <CopyPriceButton price={copyPrice} />
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <MarketItemLink typeId={row.typeId} className={buttonClassName({ variant: 'ghost' })}>
            {t('orders.viewInMarket')}
          </MarketItemLink>
          <MarketOnly typeId={row.typeId}>
            <OpenInEveButton
              kind="marketDetails"
              id={row.typeId}
              name={row.typeName}
              size="md"
              inRow
            />
          </MarketOnly>
        </div>
      </div>
    </>
  );
}
