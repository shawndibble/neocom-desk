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
import { isOffHubStation } from './hubStation';
import { CopyPriceButton } from './CopyablePrice';
import { MarketItemLink } from './MarketItemLink';
import { formatCount } from '@/lib/formatCount';

/** The modal's top: who and where, the verdict (or the short call), Copy and the item's market links. */
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
  // Without a verdict, a priceless "Do this" call ("Leave it alone",
  // "Relist it") is the short headline. A priced one never is: with no floor
  // the rival is a fact, not advice to match (decision 20260924-013535).
  const { call: fixCall } = rowFixCall(row);
  const shortCall = doThisPrice(fixCall) === null && fixCall.kind !== 'badgeAdvice';
  const offHub = isOffHubStation(row.stationName, row.locationId);

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
            {/*
                A real call, only ever reachable with an Order Floor. With no
                cost basis linked there is no way to tell "undercut them" from
                "let this one go", so the badge's generic advice is the
                fallback below — the common case, not the exception.
              */}
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
            {/*
                No floor, so no verdict: the fix list's own short call heads
                it, as the row says it; the badge's longer advice sits under.
              */}
            <p className="mt-2 text-xl font-semibold text-text">
              <OrderDoThisText row={row} interactive={false} />
            </p>
            {badge && (
              <p className="mt-1 text-sm text-text-dim">
                {t(`market.orders.badge.${badge.kind}Action`)}
              </p>
            )}
            {summary && (
              <p className="mt-1">
                <OrderRowSummaryText row={row} summary={summary} />
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mt-2 text-base font-semibold text-text">
              {badge
                ? t(`market.orders.badge.${badge.kind}Action`)
                : t('market.orders.scopeNotChecked')}
            </p>
            {summary && (
              <p className="mt-1">
                <OrderRowSummaryText row={row} summary={summary} />
              </p>
            )}
          </>
        )}
        {/* Only a price the call recommends (`verdictFigures`). On a phone it is the sheet's footer. */}
        {!isPhone && copyPrice !== null && (
          <div className="mt-3">
            <CopyPriceButton price={copyPrice} />
          </div>
        )}
        {/* The two ways to the item's market share a line of their own, under the one action. */}
        <div className="mt-2 flex flex-wrap gap-2">
          {/*
              The phone list's row is plain text, not `MarketItemLink` (a
              link nested in the row's own tap target would be nested
              interactive content) — this is where a phone reader reaches the
              item's Market listing instead.
            */}
          <MarketItemLink typeId={row.typeId} className={buttonClassName({ variant: 'ghost' })}>
            {t('orders.viewInMarket')}
          </MarketItemLink>
          {/* Where the order is edited. An abyssal type has no market window. */}
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
