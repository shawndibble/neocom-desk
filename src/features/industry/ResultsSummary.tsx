import { useState } from 'react';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Disclosure, EmptyState, InfoTooltip, Spinner, Tooltip } from '@/components/ui';
import { focusRingClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import type { BuildResult, IndustryActivity } from '@/engine/industry/types';
import type { MaterialVolumeTotals } from '@/engine/industry/materialVolume';
import type { LiquidationBasis, OwnedStockSale } from '@/engine/industry/ownedStockSale';
import type { ProfitBasis } from '@/engine/industry/profitBasis';
import type { ProductSellNow } from '@/engine/industry/productSellNow';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { formatCount } from '@/lib/formatCount';
import { cx } from '@/lib/cx';
import { CostIndexTrend } from './CostIndexTrend';
import { formatCostIndex, formatVolume } from './format';

interface CostRowProps {
  label: ReactNode;
  value: ReactNode;
  tooltip?: ReactNode;
  emphasized?: boolean;
  indented?: boolean;
  tone?: 'negative' | 'positive';
  className?: string;
}

function CostRow({
  label,
  value,
  tooltip,
  emphasized = false,
  indented = false,
  tone,
  className,
}: CostRowProps) {
  const { t } = useTranslation();
  const toneClass =
    tone === 'negative' ? 'text-isk-neg' : tone === 'positive' ? 'text-isk-pos' : 'text-text';
  return (
    <div
      className={cx(
        'flex items-center justify-between gap-2 px-2.5 py-1.5 text-[0.6875rem]',
        indented && 'pl-12',
        className
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5 font-semibold tracking-widest text-text-dim uppercase">
        {!indented && <span aria-hidden="true" className="size-4 shrink-0" />}
        {label}
        {tooltip && typeof label === 'string' && (
          <InfoTooltip label={t('common.aboutLabel', { label })} content={tooltip} />
        )}
      </span>
      <span
        className={cx(
          'font-medium whitespace-nowrap tabular-nums',
          emphasized && 'text-sm',
          toneClass
        )}
      >
        {value}
      </span>
    </div>
  );
}

interface ResultsSummaryProps {
  result: BuildResult;
  pricesReady: boolean;
  pricesUnreachable?: boolean;
  pricesLoading: boolean;
  systemCostIndex: number | null;
  productName: string;
  productTypeID: number | null;
  productUnitPrice: number | null;
  productPriceCapped?: boolean;
  productQuantity: number | null;
  costIndexSystemName: string;
  costIndexSystemId?: number;
  activity?: IndustryActivity;
  cheaperNearby?: ReactNode;
  ownedSale: { instant: OwnedStockSale; order: OwnedStockSale } | null;
  saleBasis: LiquidationBasis;
  onSaleBasisChange: (basis: LiquidationBasis) => void;
  profitBasis: ProfitBasis | null;
  profit: number | null;
  sellNow?: ProductSellNow | null;
  totalVolume: MaterialVolumeTotals;
  hubName: string;
  planSeconds?: number;
}

const COST_INDEX_ROUNDING_STEP = 0.00005;

export function ResultsSummary({
  result,
  pricesReady,
  pricesUnreachable = false,
  pricesLoading,
  systemCostIndex,
  productName,
  productTypeID,
  productUnitPrice,
  productPriceCapped = false,
  productQuantity,
  costIndexSystemName,
  costIndexSystemId,
  activity = 'manufacturing',
  cheaperNearby,
  ownedSale,
  saleBasis,
  onSaleBasisChange,
  profitBasis,
  profit,
  sellNow,
  totalVolume,
  hubName,
  planSeconds,
}: ResultsSummaryProps) {
  const { t } = useTranslation();
  const pricesUnavailableLabel = usePricesUnavailableLabel();
  const [jobFeeExpanded, setJobFeeExpanded] = useState(false);

  if (pricesLoading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner size="sm" label={t('industry.pricesLoading')} />
      </div>
    );
  }

  if (!pricesReady) {
    return (
      <EmptyState
        title={pricesUnreachable ? pricesUnavailableLabel : t('industry.pricesUnavailableTitle')}
        hint={
          pricesUnreachable
            ? t('industry.pricesUnavailableOfflineHint')
            : t('industry.pricesUnavailableHint')
        }
        className="py-6"
      />
    );
  }

  const owned = ownedSale && ownedSale.instant.ownedUnits > 0 ? ownedSale[saleBasis] : null;
  const forgone = profitBasis === 'sellValue' && owned ? owned.net : null;
  const revenue = result.revenue;

  return (
    <div className="space-y-3">
      {result.unpriceable && (
        <p className="text-xs text-warning">
          {result.unpricedMaterials.length > 0 &&
            t('industry.unpricedMaterialsWarning', { count: result.unpricedMaterials.length })}
          {result.unpricedMaterials.length > 0 && result.buyCost === null && ' '}
          {result.buyCost === null &&
            (productTypeID !== null ? (
              <MarketItemLink typeId={productTypeID}>
                {t('industry.productUnpriced', { name: productName })}
              </MarketItemLink>
            ) : (
              t('industry.productUnpriced', { name: productName })
            ))}
        </p>
      )}

      <div className="-mx-2.5 divide-y divide-line">
        {revenue !== null && (
          <CostRow
            label={
              <span className="flex flex-wrap items-baseline gap-x-1.5">
                {t('industry.ledger.sale', { name: productName })}
                {productQuantity !== null && productUnitPrice !== null && (
                  <span className="font-normal tracking-normal normal-case tabular-nums">
                    {t('industry.ledger.quantityTimesPrice', {
                      quantity: formatCount(productQuantity),
                      price: formatIsk(productUnitPrice),
                    })}
                  </span>
                )}
                {productPriceCapped && (
                  <InfoTooltip
                    label={t('industry.marketOpportunitiesPriceCapped')}
                    content={t('industry.marketOpportunitiesPriceCapped')}
                  />
                )}
              </span>
            }
            value={formatIsk(revenue)}
          />
        )}
        {result.salesTax !== null && (
          <CostRow
            label={t('industry.salesTax')}
            value={formatIsk(-result.salesTax)}
            tone="negative"
          />
        )}
        {result.brokerFee !== null && (
          <CostRow
            label={t('industry.brokerFee')}
            value={formatIsk(-result.brokerFee)}
            tone="negative"
          />
        )}
        <CostRow label={t('industry.materialCost')} value={formatIsk(-result.materialCost)} />

        <Disclosure
          label={t('industry.jobFee')}
          labelAccessory={
            <InfoTooltip
              label={t('common.aboutLabel', { label: t('industry.jobFee') })}
              content={
                <Trans
                  i18nKey="industry.jobFeeTooltip"
                  values={{ amount: formatIsk(result.jobFee.eiv * COST_INDEX_ROUNDING_STEP) }}
                  components={{ b: <strong /> }}
                />
              }
            />
          }
          trailing={formatIsk(-result.jobFee.total)}
          expanded={jobFeeExpanded}
          onToggle={() => setJobFeeExpanded((expanded) => !expanded)}
        >
          <CostRow
            label={t('industry.eiv')}
            value={formatIsk(result.jobFee.eiv)}
            tooltip={t('industry.eivTooltip')}
            indented
          />
          <CostRow
            label={t('industry.sccSurcharge')}
            value={formatIsk(result.jobFee.sccSurcharge)}
            tooltip={t('industry.sccSurchargeTooltip')}
            indented
          />
          {(result.jobFee.regionalTax ?? 0) > 0 && (
            <CostRow
              label={t('industry.exordiumTax')}
              value={formatIsk(result.jobFee.regionalTax ?? 0)}
              tooltip={t('industry.exordiumTaxTooltip')}
              indented
            />
          )}
          <CostRow
            label={t('industry.facilityTaxAmount')}
            value={formatIsk(result.jobFee.facilityTax)}
            indented
          />
          <CostRow
            label={
              systemCostIndex === null ? (
                t('industry.costIndexFee')
              ) : (
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1.5">
                    {t('industry.ledger.costIndex')}
                    <InfoTooltip
                      label={t('common.aboutLabel', { label: t('industry.costIndexFee') })}
                      content={
                        <Trans i18nKey="industry.costIndexTooltip" components={{ b: <strong /> }} />
                      }
                    />
                    <span aria-hidden="true">·</span>
                    <CostIndexTrend
                      value={formatCostIndex(systemCostIndex)}
                      systemId={costIndexSystemId}
                      systemName={costIndexSystemName}
                      activity={activity}
                      index={systemCostIndex}
                    />
                  </span>
                  <span className="font-normal tracking-normal normal-case">
                    {costIndexSystemName}
                  </span>
                </span>
              )
            }
            value={formatIsk(result.jobFee.grossCost)}
            indented
          />
        </Disclosure>
        {cheaperNearby && (
          <div className="py-2 pr-2.5 pl-8">
            <p className="flex items-start gap-2 rounded-xs bg-panel-2 px-2.5 py-2 text-xs">
              <Icon.Tip
                size={Icon.ICON_SIZE.sm}
                aria-hidden="true"
                className="mt-px shrink-0 text-accent"
              />
              <span>{cheaperNearby}</span>
            </p>
          </div>
        )}

        {forgone !== null && (
          <CostRow
            label={t('industry.ledger.ownedNotSold')}
            value={formatIsk(-forgone)}
            tooltip={t('industry.ledger.ownedNotSoldHint')}
          />
        )}
        {profit !== null && (
          <CostRow
            label={t('industry.profit')}
            value={formatIsk(profit)}
            emphasized
            tone={profit >= 0 ? 'positive' : 'negative'}
            className="relative -mt-px border-t border-line-bright"
          />
        )}
        {profit !== null && sellNow !== undefined && (
          <CostRow
            label={t('industry.ledger.profitIfSoldNow')}
            tooltip={t('industry.ledger.profitIfSoldNowHint')}
            value={
              sellNow === null ? (
                <span className="font-normal text-text-dim">
                  {t('industry.ledger.noBuyOrders', { hub: hubName })}
                </span>
              ) : (
                formatIsk(sellNow.profit)
              )
            }
            tone={sellNow === null ? undefined : sellNow.profit >= 0 ? 'positive' : 'negative'}
          />
        )}
      </div>

      <dl className="-mx-3 mt-0! -mb-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 rounded-b-xs border-t border-line bg-bg/40 px-3 py-3 text-xs">
        {revenue !== null && (
          <>
            <dt className="text-text-dim">
              {t('industry.ledger.productSellsAt', { name: productName })}
            </dt>
            <dd className="text-right">{t('industry.ledger.hubLowestSell', { hub: hubName })}</dd>
          </>
        )}
        <dt className="text-text-dim">{t('industry.ledger.iskToSpend')}</dt>
        <dd className="text-right tabular-nums">{formatIsk(result.totalCost)}</dd>
        {result.buyCost !== null && (
          <>
            <dt className="text-text-dim">
              {t('industry.ledger.buyInstead', { name: productName })}
            </dt>
            <dd className="text-right tabular-nums">
              {result.buyCost >= result.totalCost
                ? t('industry.ledger.buyCostsMore', {
                    amount: formatIsk(result.buyCost - result.totalCost),
                  })
                : t('industry.ledger.buyCostsLess', {
                    amount: formatIsk(result.totalCost - result.buyCost),
                  })}
            </dd>
          </>
        )}
        <dt className="text-text-dim">{t('industry.jobTime')}</dt>
        <dd className="text-right tabular-nums">{formatDuration(result.seconds)}</dd>
        {planSeconds !== undefined && Math.round(planSeconds) !== Math.round(result.seconds) && (
          <>
            <dt className="text-text-dim">{t('industry.ledger.wholePlanTime')}</dt>
            <dd className="text-right tabular-nums">{formatDuration(planSeconds)}</dd>
          </>
        )}
        <dt className="text-text-dim">{t('industry.totalVolume')}</dt>
        <dd className="text-right tabular-nums">
          {totalVolume.anyUnknown
            ? t('industry.totalVolumeAtLeast', { volume: formatVolume(totalVolume.volume) })
            : formatVolume(totalVolume.volume)}
        </dd>
        {owned && (
          <>
            <dt className="text-text-dim">{t('industry.ledger.ownedSellVia')}</dt>
            <dd className="text-right">
              <Tooltip content={t('industry.ledger.ownedSellViaHint')}>
                <button
                  type="button"
                  className={cx(
                    'rounded-xs font-semibold text-accent hover:text-accent/80',
                    focusRingClassName
                  )}
                  onClick={() => onSaleBasisChange(saleBasis === 'instant' ? 'order' : 'instant')}
                >
                  {saleBasis === 'instant'
                    ? t('industry.useOrSell.basisInstant')
                    : t('industry.useOrSell.basisOrder')}
                </button>
              </Tooltip>
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}
