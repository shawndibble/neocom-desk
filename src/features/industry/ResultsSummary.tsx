import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, Disclosure, EmptyState, InfoTooltip, StatChip } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import type { BuildResult } from '@/engine/industry/types';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { formatCostIndex, formatPercent } from './format';

interface CostRowProps {
  label: string;
  value: ReactNode;
  tooltip?: string;
  emphasized?: boolean;
  indented?: boolean;
  /** `'negative'` renders the value in the `isk-neg` tone, for deductions like Sales Tax/Broker Fee. */
  tone?: 'negative';
}

/** One row of the Costs stack: label (+ optional tooltip) left, value right. */
function CostRow({
  label,
  value,
  tooltip,
  emphasized = false,
  indented = false,
  tone,
}: CostRowProps) {
  const { t } = useTranslation();
  return (
    <div
      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 text-[0.6875rem] ${indented ? 'pl-7' : ''}`}
    >
      <span className="flex items-center gap-1.5 font-semibold tracking-widest text-text-dim uppercase">
        {label}
        {tooltip && <InfoTooltip label={t('common.aboutLabel', { label })} content={tooltip} />}
      </span>
      <span
        className={`font-medium tabular-nums ${emphasized ? 'text-sm text-accent' : tone === 'negative' ? 'text-isk-neg' : 'text-text'}`}
      >
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
  systemCostIndex: number | null;
  productName: string;
  /** Product's lowest hub sell price (per unit); null when unpriced at this hub. */
  productUnitPrice: number | null;
  /** Units produced by the job (per-run product quantity x runs); null when the blueprint has no product. */
  productQuantity: number | null;
  /** Short solar-system name the build's cost index applies to (UX-REVIEW #6/#8: makes the trade-hub <-> build-system coupling explicit in the label). */
  costIndexSystemName: string;
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
  systemCostIndex,
  productName,
  productUnitPrice,
  productQuantity,
  costIndexSystemName,
}: ResultsSummaryProps) {
  const { t } = useTranslation();
  const [jobFeeExpanded, setJobFeeExpanded] = useState(false);

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

  return (
    <div className="space-y-3">
      {result.unpriceable && (
        <p className="text-xs text-warning">
          {result.unpricedMaterials.length > 0 &&
            t('industry.unpricedMaterialsWarning', { count: result.unpricedMaterials.length })}
          {result.unpricedMaterials.length > 0 && result.buyCost === null && ' '}
          {result.buyCost === null && t('industry.productUnpriced', { name: productName })}
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
        <div className="flex flex-wrap gap-2">
          {result.profit !== null && (
            <StatChip
              label={t('industry.profit')}
              value={formatIsk(result.profit)}
              tone={result.profit >= 0 ? 'success' : 'danger'}
            />
          )}
          {result.marginPct !== null && (
            <StatChip label={t('industry.margin')} value={formatPercent(result.marginPct)} />
          )}
          {result.iskPerHour !== null && (
            <StatChip
              label={t('industry.iskPerHour')}
              value={formatIsk(result.iskPerHour)}
              tooltip={t('industry.iskPerHourTooltip')}
            />
          )}
        </div>
      )}

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
  );
}
