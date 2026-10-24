import { useState } from 'react';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Disclosure, EmptyState, InfoTooltip, Spinner, Tooltip } from '@/components/ui';
import { focusRingClassName } from '@/components/ui/controlStyles';
import type { BuildResult, IndustryActivity } from '@/engine/industry/types';
import type { MaterialVolumeTotals } from '@/engine/industry/materialVolume';
import type { LiquidationBasis, OwnedStockSale } from '@/engine/industry/ownedStockSale';
import type { ProfitBasis } from '@/engine/industry/profitBasis';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { formatCount } from '@/lib/formatCount';
import { cx } from '@/lib/cx';
import { CostIndexTrend } from './CostIndexTrend';
import { formatCostIndex, formatVolume } from './format';

/** One slice of the "where the sale goes" bar and the matching ledger row's swatch. */
const SEGMENT = {
  fees: 'bg-warning/70',
  materials: 'bg-text-dim/60',
  job: 'bg-line-bright',
  owned: 'bg-accent-dim',
  profit: 'bg-isk-pos',
} as const;
type Segment = keyof typeof SEGMENT;

interface CostRowProps {
  label: ReactNode;
  value: ReactNode;
  tooltip?: ReactNode;
  emphasized?: boolean;
  indented?: boolean;
  /** `'negative'`/`'positive'` render the value in the `isk-neg`/`isk-pos` tone. */
  tone?: 'negative' | 'positive';
  /** The bar slice this row is, so the bar needs no separate legend. */
  swatch?: Segment;
}

/** One ledger row: label (+ optional tooltip) left, value right. */
function CostRow({
  label,
  value,
  tooltip,
  emphasized = false,
  indented = false,
  tone,
  swatch,
}: CostRowProps) {
  const { t } = useTranslation();
  const toneClass =
    tone === 'negative' ? 'text-isk-neg' : tone === 'positive' ? 'text-isk-pos' : 'text-text';
  return (
    <div
      className={cx(
        'flex items-center justify-between gap-2 px-2.5 py-1.5 text-[0.6875rem]',
        indented && 'pl-7'
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5 font-semibold tracking-widest text-text-dim uppercase">
        {swatch && (
          <span
            aria-hidden="true"
            className={cx('size-2.5 shrink-0 rounded-xs', SEGMENT[swatch])}
          />
        )}
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
  /** False when adjusted prices / cost index couldn't be fetched live (no local cache — offline). */
  pricesReady: boolean;
  /** True when the price source could not be reached (offline): the empty state then says so. */
  pricesUnreachable?: boolean;
  /** True while the market snapshot's first fetch for this plan is in flight. */
  pricesLoading: boolean;
  systemCostIndex: number | null;
  productName: string;
  /** The product's typeID, for the unpriced-product warning's Market link; null when the blueprint has no product. */
  productTypeID: number | null;
  /** Product's lowest hub sell price (per unit); null when unpriced at this hub. */
  productUnitPrice: number | null;
  /** Units produced by the job (per-run product quantity x runs); null when the blueprint has no product. */
  productQuantity: number | null;
  /** Short solar-system name the build's cost index applies to. */
  costIndexSystemName: string;
  /** The build system's ID and the plan's activity, for the cost index trend popover; no id, no popover. */
  costIndexSystemId?: number;
  activity?: IndustryActivity;
  /** The cheaper-system line under the cost index, when one is known. */
  cheaperNearby?: ReactNode;
  /**
   * What the owned materials this job consumes would net if sold, on both
   * liquidation bases; null while there is nothing to quote against.
   */
  ownedSale: { instant: OwnedStockSale; order: OwnedStockSale } | null;
  /** How the owned materials would be sold — the "sell via" flip below the ledger. */
  saleBasis: LiquidationBasis;
  onSaleBasisChange: (basis: LiquidationBasis) => void;
  /** The hero's basis: on `sellValue`, the forgone sale is a ledger line and profit is net of it. */
  profitBasis: ProfitBasis | null;
  /** Profit on `profitBasis` — the ledger's bottom line, the hero's big number. */
  profit: number | null;
  /** Grand total m3 across the materials table, for hauling-trip planning (issue #874). */
  totalVolume: MaterialVolumeTotals;
}

/**
 * Worst-case error in ESI's cost index, which it rounds to 4 decimals (half
 * of 0.0001). Times EIV, that bounds how far the job fee can drift from the
 * game's; a structure's job-cost bonus only shrinks it.
 */
const COST_INDEX_ROUNDING_STEP = 0.00005;

/**
 * Where the sale goes: a bar of the product's revenue split into fees,
 * materials, job cost, (on the sell-value basis) the owned materials not
 * sold, and profit, then the ledger that adds up to the hero's figure. The
 * hero states margin, ISK/hour and break-even; this panel carries the working
 * and the plan facts that are not a verdict (ISK to spend, buying instead,
 * job time, volume).
 *
 * Every ledger figure stays on `formatIsk` at full precision (issue #948):
 * this is the ledger a player reconciles line by line.
 */
export function ResultsSummary({
  result,
  pricesReady,
  pricesUnreachable = false,
  pricesLoading,
  systemCostIndex,
  productName,
  productTypeID,
  productUnitPrice,
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
  totalVolume,
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
  const fees =
    result.salesTax !== null && result.brokerFee !== null
      ? result.salesTax + result.brokerFee
      : null;
  const revenue = result.revenue;

  const slices: { key: Segment; value: number }[] = [
    { key: 'fees' as const, value: fees ?? 0 },
    { key: 'materials' as const, value: result.materialCost },
    { key: 'job' as const, value: result.jobFee.total },
    { key: 'owned' as const, value: forgone ?? 0 },
    { key: 'profit' as const, value: Math.max(0, profit ?? 0) },
  ].filter((slice) => slice.value > 0);
  // A loss has no honest split of the sale: the costs are bigger than it.
  const showBar = revenue !== null && revenue > 0 && profit !== null && profit >= 0;

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

      {showBar && (
        <div
          role="img"
          aria-label={t('industry.ledger.barLabel', {
            parts: slices
              .map((slice) =>
                t(`industry.ledger.slice.${slice.key}`, {
                  pct: Math.round((slice.value / revenue) * 100),
                })
              )
              .join(', '),
          })}
          className="flex h-4 gap-0.5 overflow-hidden rounded-xs"
        >
          {slices.map((slice) => (
            <div
              key={slice.key}
              className={SEGMENT[slice.key]}
              style={{ width: `${(slice.value / revenue) * 100}%` }}
            />
          ))}
        </div>
      )}

      <div className="divide-y divide-line rounded-xs border border-line">
        {revenue !== null && (
          <CostRow
            label={
              <span className="flex flex-wrap items-baseline gap-x-1.5">
                {t('industry.ledger.sale', { name: productName })}
                {productQuantity !== null && productUnitPrice !== null && (
                  <span className="font-normal tracking-normal normal-case tabular-nums">
                    {formatCount(productQuantity)} × {formatIsk(productUnitPrice)}
                  </span>
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
            swatch="fees"
          />
        )}
        {result.brokerFee !== null && (
          <CostRow
            label={t('industry.brokerFee')}
            value={formatIsk(-result.brokerFee)}
            tone="negative"
            swatch="fees"
          />
        )}
        <CostRow
          label={t('industry.materialCost')}
          value={formatIsk(-result.materialCost)}
          swatch="materials"
        />

        <Disclosure
          label={
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cx('size-2.5 rounded-xs', SEGMENT.job)} />
              {t('industry.jobFee')}
            </span>
          }
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
            label={
              systemCostIndex === null ? (
                t('industry.costIndexFee')
              ) : (
                <span className="flex items-center gap-1.5">
                  {t('industry.ledger.costIndexIn', { system: costIndexSystemName })}
                  <CostIndexTrend
                    value={formatCostIndex(systemCostIndex)}
                    systemId={costIndexSystemId}
                    systemName={costIndexSystemName}
                    activity={activity}
                    index={systemCostIndex}
                  />
                </span>
              )
            }
            value={formatIsk(result.jobFee.grossCost)}
            indented
          />
          <CostRow
            label={t('industry.sccSurcharge')}
            value={formatIsk(result.jobFee.sccSurcharge)}
            tooltip={t('industry.sccSurchargeTooltip')}
            indented
          />
          <CostRow
            label={t('industry.facilityTaxAmount')}
            value={formatIsk(result.jobFee.facilityTax)}
            indented
          />
          {cheaperNearby && <div className="py-1.5 pr-2.5 pl-7 text-xs">{cheaperNearby}</div>}
        </Disclosure>

        {forgone !== null && (
          <CostRow
            label={t('industry.ledger.ownedNotSold')}
            value={formatIsk(-forgone)}
            tooltip={t('industry.ledger.ownedNotSoldHint')}
            swatch="owned"
          />
        )}
        {profit !== null && (
          <CostRow
            label={t('industry.profit')}
            value={formatIsk(profit)}
            emphasized
            tone={profit >= 0 ? 'positive' : 'negative'}
            swatch="profit"
          />
        )}
      </div>

      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-xs">
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
              {/* §6c: accent text, no underline, tooltip naming the press — a value that flips in place. */}
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
