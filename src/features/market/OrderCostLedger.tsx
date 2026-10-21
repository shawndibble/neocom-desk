import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { InfoTooltip } from '@/components/ui';
import { formatIsk, formatMarketIsk } from '@/lib/isk';
import type { OpenOrderRow } from './openOrdersModel';
import type { OrderDetailView } from './orderDetailView';
import { CopyablePrice } from './CopyablePrice';
import { formatCount } from '@/lib/formatCount';

/** "What it cost you" once a cost basis is known: build run or wallet buys, fees, floor. */
export function CostLedger({
  row,
  costBasis,
  relistFees,
  floorShown,
}: {
  row: OpenOrderRow;
  costBasis: NonNullable<OpenOrderRow['costBasis']>;
  relistFees: OrderDetailView['relistFees'];
  floorShown: number | null;
}) {
  const { t } = useTranslation();
  return (
    <>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-xs">
        {costBasis.source === 'wallet' ? (
          <>
            <LedgerRow
              label={t('market.orders.walletBasisUnits')}
              value={formatCount(costBasis.unitsCovered)}
            />
            <LedgerRow
              label={t('market.orders.walletBasisBuys')}
              value={formatCount(costBasis.buyCount)}
            />
            <LedgerRow
              label={t('market.orders.walletBasisRange')}
              value={t('market.orders.walletBasisRangeValue', {
                from: new Date(costBasis.oldestBuy).toLocaleDateString(),
                to: new Date(costBasis.newestBuy).toLocaleDateString(),
              })}
            />
          </>
        ) : (
          <>
            <LedgerRow label={t('industry.quantity')} value={formatCount(costBasis.runQuantity)} />
            <LedgerRow
              label={t('industry.materialCost')}
              value={`${formatIsk(costBasis.materialCost)} ISK`}
            />
            <LedgerRow label={t('industry.jobFee')} value={`${formatIsk(costBasis.jobFee)} ISK`} />
            <LedgerRow
              label={t('industry.totalCost')}
              value={`${formatIsk(costBasis.materialCost + costBasis.jobFee)} ISK`}
            />
          </>
        )}
        {/*
          Per unit, not per run — the pivot from the batch totals above to the
          per-unit figures below. `unitCost` is exactly `totalCost /
          runQuantity` (orderCostBasis.ts); 2 decimals to match the floor rows
          it feeds into, not the 0-decimal batch totals above it.
        */}
        <LedgerRow
          label={t('market.orders.costPerUnit')}
          value={`${formatMarketIsk(costBasis.unitCost)} ISK`}
        />
        {costBasis.source === 'wallet' && (
          <div className="col-span-2 space-y-0.5 text-text-dim">
            <ul>
              {costBasis.buys.map((buy, i) => (
                <li key={i}>
                  {t('market.orders.walletBasisBuyLine', {
                    quantity: formatCount(buy.quantity),
                    price: formatMarketIsk(buy.unitPrice),
                    date: new Date(buy.date).toLocaleDateString(),
                  })}
                </li>
              ))}
            </ul>
            <p>{t('market.orders.walletBasisNoBuyFee')}</p>
          </div>
        )}
        {/*
          The two fee lines sum with cost per unit to exactly the relist floor
          below — `relistFees` in `orderDetailView.ts` says why they are read
          that way.
        */}
        {relistFees && (
          <>
            <LedgerRow
              label={t('industry.salesTax')}
              value={`${formatMarketIsk(relistFees.salesTax)} ISK`}
            />
            <LedgerRow
              label={t('market.orders.relistBrokerFee')}
              value={`${formatMarketIsk(relistFees.brokerFee)} ISK`}
            />
          </>
        )}
        {floorShown !== null && (
          // Only ONE floor is ever shown as a ledger number (design
          // decision): `floor.fill` — what leaving the order alone would net
          // once it sells — appears only in the prose below, which is the one
          // place the smaller number is the answer to something. The ledger
          // math itself still sums to the exact `row.floor.relist`, never the
          // rounded figure.
          <LedgerRow
            label={t('market.orders.floorLabel')}
            tooltip={t('market.orders.floorHelp')}
            value={
              <span
                className={row.floor && row.price < row.floor.relist ? 'text-danger' : undefined}
              >
                <CopyablePrice price={floorShown} /> ISK
              </span>
            }
          />
        )}
      </dl>
      {row.floor && (
        <>
          <p className="text-xs text-text-dim">
            {t(
              costBasis.source === 'wallet'
                ? 'market.orders.statFloorCaptionWallet'
                : 'market.orders.statFloorCaption'
            )}{' '}
            {t('market.orders.floorBreakEvenNote')}
          </p>
          <div className="rounded-xs border border-line bg-panel p-2">
            <p className={eyebrowClassName}>{t('market.orders.floorWhyBroker')}</p>
            <p className="mt-1 text-xs text-text">
              {t('market.orders.floorWhyBrokerBody', {
                relist: formatMarketIsk(row.floor.relist),
              })}
            </p>
            <p className="mt-1 text-xs text-text-dim">
              {t('market.orders.floorWhyBrokerFill', {
                price: formatMarketIsk(row.price),
                fill: formatMarketIsk(row.floor.fill),
                difference: formatMarketIsk(row.floor.relist - row.floor.fill),
              })}
            </p>
          </div>
        </>
      )}
    </>
  );
}

function LedgerRow({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: ReactNode;
  /** Explains the label's term, as a "?" after it. */
  tooltip?: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      <dt className="flex items-center gap-1 font-semibold tracking-widest text-text-dim uppercase">
        {label}
        {tooltip && <InfoTooltip label={t('common.aboutLabel', { label })} content={tooltip} />}
      </dt>
      <dd className="text-right tabular-nums text-text">{value}</dd>
    </>
  );
}
