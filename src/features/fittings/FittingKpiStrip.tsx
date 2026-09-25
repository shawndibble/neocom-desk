import { useTranslation } from 'react-i18next';
import type { FittingStats } from '@/engine/fittings/types';
import type { Appraisal } from '@/engine/market/appraisal';
import { formatIskCompact } from '@/lib/isk';

interface FittingKpiStripProps {
  stats: FittingStats | null;
  price: Appraisal | null;
}

/**
 * The headline numbers under the Fitting's header (scope decision
 * `20260924-215855`): what the stats sections below go into in detail, at a
 * glance. DPS is the Offense section's total — weapons and drones, without
 * reload or overheat.
 */
export function FittingKpiStrip({ stats, price }: FittingKpiStripProps) {
  const { t } = useTranslation();
  const cells: { label: string; value: string | null; tone?: 'success' | 'danger' }[] = [
    { label: t('fittings.kpi.dps'), value: stats ? stats.offense.dps.toFixed(0) : null },
    { label: t('fittings.kpi.ehp'), value: stats ? stats.ehp.toFixed(0) : null },
    {
      label: t('fittings.kpi.capacitor'),
      value: stats
        ? stats.capacitor.stable
          ? t('fittings.stats.capacitorStable', {
              pct: stats.capacitor.stablePercentage.toFixed(0),
            })
          : t('fittings.stats.capacitorDepletes', {
              seconds: stats.capacitor.depletesInSeconds.toFixed(0),
            })
        : null,
      tone: stats ? (stats.capacitor.stable ? 'success' : 'danger') : undefined,
    },
    {
      label: t('fittings.kpi.speed'),
      value: stats
        ? t('fittings.stats.maxVelocityMeta', { value: stats.navigation.maxVelocity.toFixed(0) })
        : null,
    },
    {
      label: t('fittings.kpi.lockRange'),
      value: stats
        ? t('fittings.kpi.km', { value: (stats.targeting.maxTargetRange / 1000).toFixed(1) })
        : null,
    },
    {
      label: t('fittings.kpi.signature'),
      value: stats
        ? t('fittings.kpi.metres', { value: stats.targeting.signatureRadius.toFixed(0) })
        : null,
    },
    {
      label: t('fittings.kpi.price'),
      value: price ? t('fittings.kpi.isk', { value: formatIskCompact(price.totals.sell) }) : null,
    },
  ];
  return (
    <dl className="grid grid-cols-3 border-t border-line sm:grid-cols-4 xl:grid-cols-7">
      {cells.map((cell) => (
        <div key={cell.label} className="border-r border-b border-line px-3 py-2 last:border-r-0">
          <dt className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {cell.label}
          </dt>
          <dd
            className={`text-sm font-semibold tabular-nums sm:text-base ${cell.tone === 'success' ? 'text-success' : cell.tone === 'danger' ? 'text-danger' : ''}`}
          >
            {cell.value ?? '…'}
          </dd>
        </div>
      ))}
    </dl>
  );
}
