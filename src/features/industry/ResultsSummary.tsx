import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Button,
  DataTable,
  Disclosure,
  EmptyState,
  FilterChip,
  InfoTooltip,
  Spinner,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { DataTableColumn } from '@/components/ui';
import type { BuildResult } from '@/engine/industry/types';
import {
  compareUseOrSell,
  type LiquidationBasis,
  type OwnedStockSale,
} from '@/engine/industry/ownedStockSale';
import { marketItemUrl } from '@/engine/market/urlState';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { formatCostIndex, formatPercent } from './format';
import { CalculationBreakdown, type BreakdownContext } from './CalculationBreakdown';

interface CostRowProps {
  label: string;
  value: ReactNode;
  tooltip?: string;
  emphasized?: boolean;
  indented?: boolean;
  /** `'negative'`/`'positive'` render the value in the `isk-neg`/`isk-pos` tone, e.g. for
   * deductions like Sales Tax/Broker Fee, or a Profit row that can go either way. */
  tone?: 'negative' | 'positive';
  /** Makes the row's tooltip trigger open the calculation breakdown on click. */
  onTooltipClick?: () => void;
}

/** One row of the Costs stack: label (+ optional tooltip) left, value right. */
function CostRow({
  label,
  value,
  tooltip,
  emphasized = false,
  indented = false,
  tone,
  onTooltipClick,
}: CostRowProps) {
  const { t } = useTranslation();
  const toneClass =
    tone === 'negative'
      ? 'text-isk-neg'
      : tone === 'positive'
        ? 'text-isk-pos'
        : emphasized
          ? 'text-accent'
          : 'text-text';
  return (
    <div
      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 text-[0.6875rem] ${indented ? 'pl-7' : ''}`}
    >
      <span className="flex items-center gap-1.5 font-semibold tracking-widest text-text-dim uppercase">
        {label}
        {tooltip && (
          <InfoTooltip
            label={t('common.aboutLabel', { label })}
            content={tooltip}
            onClick={onTooltipClick}
            {...(onTooltipClick ? { 'aria-haspopup': 'dialog' as const } : {})}
          />
        )}
      </span>
      <span className={`font-medium tabular-nums ${emphasized ? 'text-sm' : ''} ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}

interface RevenueRow {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface ResultsSummaryProps {
  result: BuildResult;
  /** False when adjusted prices / cost index couldn't be fetched live (no local cache — offline). */
  pricesReady: boolean;
  /**
   * True while the market snapshot's initial fetch for this plan is still in
   * flight. Distinct from `!pricesReady`: without this, "just opened, nothing
   * back yet" and "the live ESI call genuinely failed" read as the same
   * state and the failure copy would flash on every fresh load.
   */
  pricesLoading: boolean;
  systemCostIndex: number | null;
  productName: string;
  /** The product's typeID, for the unpriced-product warning's Market link; null when the blueprint has no product. */
  productTypeID: number | null;
  /** Product's lowest hub sell price (per unit); null when unpriced at this hub. */
  productUnitPrice: number | null;
  /** Units produced by the job (per-run product quantity x runs); null when the blueprint has no product. */
  productQuantity: number | null;
  /** Short solar-system name the build's cost index applies to (UX-REVIEW #6/#8: makes the trade-hub <-> build-system coupling explicit in the label). */
  costIndexSystemName: string;
  /** The inputs behind the numbers, quoted back by the calculation breakdown modal. */
  breakdown: BreakdownContext;
  /**
   * What the materials the player already owns would fetch if sold instead of
   * consumed, quoted on both liquidation bases. Null when the plan owns none —
   * the whole comparison only exists for a player who is holding stock.
   */
  ownedSale: { instant: OwnedStockSale; order: OwnedStockSale } | null;
}

/**
 * Job fee breakdown, cost, profit, margin, ISK/hour, and the build-vs-buy
 * verdict. Gated on `pricesReady`: without it there is nothing honest to
 * show (job cost needs live adjusted prices + system cost index, neither of
 * which are cached locally) — materials + time stay visible in the sibling
 * panel regardless.
 */
export function ResultsSummary({
  result,
  pricesReady,
  pricesLoading,
  systemCostIndex,
  productName,
  productTypeID,
  productUnitPrice,
  productQuantity,
  costIndexSystemName,
  breakdown,
  ownedSale,
}: ResultsSummaryProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [jobFeeExpanded, setJobFeeExpanded] = useState(false);
  const [profitView, setProfitView] = useState<'net' | 'gross'>('net');
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [saleBasis, setSaleBasis] = useState<LiquidationBasis>('instant');

  const revenueColumns = useMemo<DataTableColumn<RevenueRow>[]>(
    () => [
      { id: 'product', header: t('industry.product'), render: (row) => row.name },
      {
        id: 'quantity',
        header: t('industry.quantity'),
        align: 'right',
        className: 'tabular-nums',
        render: (row) => row.quantity.toLocaleString(),
      },
      {
        id: 'unitPrice',
        header: t('industry.unitPrice'),
        align: 'right',
        className: 'tabular-nums',
        render: (row) => formatIsk(row.unitPrice),
      },
      {
        id: 'lineTotal',
        header: t('industry.lineTotal'),
        align: 'right',
        className: 'tabular-nums',
        render: (row) => formatIsk(row.lineTotal),
      },
    ],
    [t]
  );

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
        title={t('industry.pricesUnavailableTitle')}
        hint={t('industry.pricesUnavailableHint')}
        className="py-6"
      />
    );
  }

  const hasVerdict = result.recommendation !== 'unknown';
  const displayProfit = profitView === 'gross' ? result.grossProfit : result.profit;
  const displayMargin = profitView === 'gross' ? result.grossMargin : result.marginPct;
  const displayIskPerHour = profitView === 'gross' ? result.grossIskPerHour : result.iskPerHour;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => setBreakdownOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={breakdownOpen}
        >
          <Icon.Info size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          {t('industry.breakdownTrigger')}
        </Button>
      </div>
      <CalculationBreakdown
        open={breakdownOpen}
        onClose={() => setBreakdownOpen(false)}
        result={result}
        context={breakdown}
      />

      {result.unpriceable && (
        <p className="text-xs text-warning">
          {result.unpricedMaterials.length > 0 &&
            t('industry.unpricedMaterialsWarning', { count: result.unpricedMaterials.length })}
          {result.unpricedMaterials.length > 0 && result.buyCost === null && ' '}
          {result.buyCost === null &&
            (productTypeID !== null ? (
              <button
                type="button"
                className="underline"
                onClick={() => navigate(marketItemUrl(productTypeID, location.search))}
              >
                {t('industry.productUnpriced', { name: productName })}
              </button>
            ) : (
              t('industry.productUnpriced', { name: productName })
            ))}
        </p>
      )}

      <div className="divide-y divide-line rounded-xs border border-line">
        <CostRow label={t('industry.materialCost')} value={formatIsk(result.materialCost)} />

        <Disclosure
          label={t('industry.jobFee')}
          trailing={formatIsk(result.jobFee.total)}
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
            label={t('industry.costIndexFee')}
            value={formatIsk(result.jobFee.grossCost)}
            tooltip={t('industry.costIndexFeeTooltip')}
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
        </Disclosure>

        <CostRow label={t('industry.totalCost')} value={formatIsk(result.totalCost)} emphasized />
        <CostRow label={t('industry.time')} value={formatDuration(result.seconds)} />
        {systemCostIndex !== null && (
          <CostRow
            label={t('industry.costIndexWithSystem', { system: costIndexSystemName })}
            value={formatCostIndex(systemCostIndex)}
            tooltip={t('industry.costIndexTooltip')}
          />
        )}
      </div>

      {result.revenue !== null &&
        result.salesTax !== null &&
        result.brokerFee !== null &&
        result.netRevenue !== null &&
        productUnitPrice !== null &&
        productQuantity !== null && (
          <div className="space-y-2">
            <div className="overflow-x-auto">
              <DataTable
                columns={revenueColumns}
                rows={[
                  {
                    name: productName,
                    quantity: productQuantity,
                    unitPrice: productUnitPrice,
                    lineTotal: result.revenue,
                  },
                ]}
                rowKey={() => 'revenue'}
                label={t('industry.revenue')}
                density="compact"
              />
            </div>
            <div className="divide-y divide-line rounded-xs border border-line">
              <CostRow
                label={t('industry.salesTax')}
                value={formatIsk(-result.salesTax)}
                tone="negative"
              />
              <CostRow
                label={t('industry.brokerFee')}
                value={formatIsk(-result.brokerFee)}
                tone="negative"
              />
              <CostRow
                label={t('industry.netRevenue')}
                value={formatIsk(result.netRevenue)}
                emphasized
              />
            </div>
          </div>
        )}

      {(result.profit !== null || result.marginPct !== null || result.iskPerHour !== null) && (
        <div className="space-y-2">
          <div role="group" aria-label={t('industry.profitToggleLabel')} className="flex gap-1.5">
            <FilterChip
              label={t('industry.toggleNet')}
              selected={profitView === 'net'}
              onToggle={() => setProfitView('net')}
            />
            <FilterChip
              label={t('industry.toggleGross')}
              selected={profitView === 'gross'}
              onToggle={() => setProfitView('gross')}
            />
          </div>
          <div className="divide-y divide-line rounded-xs border border-line">
            {displayProfit !== null && (
              <CostRow
                label={t('industry.profit')}
                value={formatIsk(displayProfit)}
                emphasized
                tone={displayProfit >= 0 ? 'positive' : 'negative'}
              />
            )}
            {displayMargin !== null && (
              <CostRow label={t('industry.margin')} value={formatPercent(displayMargin)} />
            )}
            {displayIskPerHour !== null && (
              <CostRow
                label={t('industry.iskPerHour')}
                value={formatIsk(displayIskPerHour)}
                tooltip={t('industry.iskPerHourTooltip')}
              />
            )}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('industry.acquisitionVerdictLabel')}
        </p>
        {hasVerdict ? (
          <p
            className={`text-sm font-semibold ${
              result.recommendation === 'build' ? 'text-success' : 'text-warning'
            }`}
          >
            {result.recommendation === 'build'
              ? t('industry.verdictBuild', {
                  amount: formatIsk((result.buyCost ?? 0) - result.totalCost),
                })
              : t('industry.verdictBuy', {
                  amount: formatIsk(result.totalCost - (result.buyCost ?? 0)),
                })}
          </p>
        ) : (
          <p className="text-xs text-text-dim">{t('industry.verdictUnknown')}</p>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('industry.saleProfitabilityLabel')}
        </p>
        {displayProfit !== null ? (
          <p
            className={`text-sm font-semibold ${displayProfit >= 0 ? 'text-success' : 'text-warning'}`}
          >
            {displayProfit >= 0
              ? t('industry.saleProfitabilityProfit', { amount: formatIsk(displayProfit) })
              : t('industry.saleProfitabilityLoss', { amount: formatIsk(Math.abs(displayProfit)) })}
          </p>
        ) : (
          <p className="text-xs text-text-dim">{t('industry.saleProfitabilityUnknown')}</p>
        )}
        {result.breakEvenPrice !== null && (
          <div className="divide-y divide-line rounded-xs border border-line">
            <CostRow
              label={t('industry.breakEvenPrice')}
              value={formatIsk(result.breakEvenPrice)}
              tooltip={t('industry.breakEvenPriceTooltip')}
              onTooltipClick={() => setBreakdownOpen(true)}
            />
            {productUnitPrice !== null && (
              <CostRow
                label={t('industry.currentMarketPrice')}
                value={formatIsk(productUnitPrice)}
              />
            )}
          </div>
        )}
      </div>

      {ownedSale && ownedSale[saleBasis].ownedUnits > 0 && (
        <div className="space-y-1">
          <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('industry.useOrSell.label')}
          </p>
          <p className="text-xs text-text-dim">{t('industry.useOrSell.intro')}</p>
          <div
            role="group"
            aria-label={t('industry.useOrSell.basisLabel')}
            className="flex gap-1.5"
          >
            <FilterChip
              label={t('industry.useOrSell.basisInstant')}
              selected={saleBasis === 'instant'}
              onToggle={() => setSaleBasis('instant')}
            />
            <FilterChip
              label={t('industry.useOrSell.basisOrder')}
              selected={saleBasis === 'order'}
              onToggle={() => setSaleBasis('order')}
            />
          </div>
          <div className="divide-y divide-line rounded-xs border border-line">
            <CostRow
              label={t('industry.useOrSell.sellNet')}
              value={formatIsk(ownedSale[saleBasis].net)}
              tooltip={t('industry.useOrSell.sellNetTooltip')}
              onTooltipClick={() => setBreakdownOpen(true)}
            />
            {result.profit !== null && (
              <CostRow
                label={t('industry.useOrSell.buildProfit')}
                value={formatIsk(result.profit)}
                tone={result.profit >= 0 ? 'positive' : 'negative'}
              />
            )}
          </div>
          {(() => {
            const verdict = compareUseOrSell(result.profit, ownedSale[saleBasis]);
            if (verdict === null) {
              return <p className="text-xs text-text-dim">{t('industry.useOrSell.unknown')}</p>;
            }
            return (
              <p
                className={`text-sm font-semibold ${
                  verdict.verdict === 'build' ? 'text-success' : 'text-warning'
                }`}
              >
                {verdict.verdict === 'build'
                  ? t('industry.useOrSell.verdictBuild', {
                      amount: formatIsk(verdict.advantage),
                    })
                  : t('industry.useOrSell.verdictSell', {
                      amount: formatIsk(Math.abs(verdict.advantage)),
                    })}
              </p>
            );
          })()}
        </div>
      )}
    </div>
  );
}
