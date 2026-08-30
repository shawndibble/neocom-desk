import { useTranslation } from 'react-i18next';
import { EmptyState, StatChip } from '@/components/ui';
import type { BuildResult } from '@/engine/industry/types';
import { formatDuration } from '@/lib/duration';
import { formatCostIndex, formatIsk, formatPercent } from './format';

interface ResultsSummaryProps {
  result: BuildResult;
  /** False when adjusted prices / cost index couldn't be fetched live (no local cache — offline). */
  pricesReady: boolean;
  systemCostIndex: number | null;
  productName: string;
  /** Product's lowest hub sell price (per unit); null when unpriced at this hub. */
  productUnitPrice: number | null;
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
  costIndexSystemName,
}: ResultsSummaryProps) {
  const { t } = useTranslation();

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

      <div className="flex flex-wrap gap-2">
        <StatChip
          label={t('industry.eiv')}
          value={formatIsk(result.jobFee.eiv)}
          tooltip={t('industry.eivTooltip')}
        />
        <StatChip
          label={t('industry.costIndexFee')}
          value={formatIsk(result.jobFee.grossCost)}
          tooltip={t('industry.costIndexFeeTooltip')}
        />
        <StatChip
          label={t('industry.sccSurcharge')}
          value={formatIsk(result.jobFee.sccSurcharge)}
          tooltip={t('industry.sccSurchargeTooltip')}
        />
        <StatChip
          label={t('industry.facilityTaxAmount')}
          value={formatIsk(result.jobFee.facilityTax)}
        />
        <StatChip
          label={t('industry.jobFee')}
          value={formatIsk(result.jobFee.total)}
          tone="accent"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <StatChip label={t('industry.materialCost')} value={formatIsk(result.materialCost)} />
        <StatChip
          label={t('industry.totalCost')}
          value={formatIsk(result.totalCost)}
          tone="accent"
        />
        <StatChip label={t('industry.time')} value={formatDuration(result.seconds)} />
        {systemCostIndex !== null && (
          <StatChip
            label={t('industry.costIndexWithSystem', { system: costIndexSystemName })}
            value={formatCostIndex(systemCostIndex)}
            tooltip={t('industry.costIndexTooltip')}
          />
        )}
      </div>

      {(productUnitPrice !== null || result.buyCost !== null) && (
        <div className="flex flex-wrap gap-2">
          {productUnitPrice !== null && (
            <StatChip label={t('industry.productPrice')} value={formatIsk(productUnitPrice)} />
          )}
          {result.buyCost !== null && (
            <StatChip label={t('industry.sellValue')} value={formatIsk(result.buyCost)} />
          )}
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
