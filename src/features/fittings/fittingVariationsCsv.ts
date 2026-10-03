import type { CsvColumn } from '@/lib/csv';
import { formatSeconds } from '@/lib/duration';
import { type StatChange, STAT_DIGITS } from '@/engine/fittings/variationDelta';
import type { VariationRow } from './useModuleVariations';

type Translate = (key: string, opts?: Record<string, unknown>) => string;

function formatDelta(change: StatChange): number {
  const digits = STAT_DIGITS[change.key];
  const factor = 10 ** digits;
  return Math.round((change.after - change.before) * factor) / factor;
}

/** One stat change as the Variations table words it ("CPU used +5 tf"). */
export function changeLabel(change: StatChange, t: Translate): string {
  if (change.key === 'capacitor') {
    return change.after >= 0
      ? t('fittings.variations.stat.capacitorStable', { pct: change.after.toFixed(0) })
      : t('fittings.variations.stat.capacitorUnstable', {
          time: formatSeconds(-change.after),
        });
  }
  const delta = formatDelta(change);
  const value = delta > 0 ? `+${delta}` : `${delta}`;
  return t(`fittings.variations.stat.${change.key}`, { value });
}

/**
 * Export columns for the Variations table. The stat changes are one text
 * cell (the table's own wording, `; `-joined) — each is a different stat and
 * unit, so they do not split into summable columns. A cell still loading
 * exports blank rather than the table's "Loading…".
 */
export function fittingVariationsCsvColumns(t: Translate): CsvColumn<VariationRow>[] {
  return [
    { header: t('fittings.variations.name'), value: (row) => row.name },
    {
      header: t('fittings.variations.changes'),
      value: (row) => {
        if (row.delta === null) return null;
        if (row.delta.count === 0) return t('fittings.variations.noChanges');
        return row.delta.changes.map((change) => changeLabel(change, t)).join('; ');
      },
    },
    {
      header: t('fittings.variations.fits'),
      value: (row) => {
        if (row.fits === null) return null;
        if (row.fits) return t('fittings.variations.fitsYes');
        return row.overage
          ? t('fittings.variations.stillOverBy', {
              amount: row.overage.amount.toFixed(1),
              resource: t(`fittings.list.${row.overage.resource}`),
            })
          : t('fittings.variations.fitsNo');
      },
    },
    {
      header: t('fittings.variations.canFly'),
      value: (row) =>
        row.canFly === null
          ? null
          : t(row.canFly ? 'fittings.variations.canFlyYes' : 'fittings.variations.canFlyNo'),
    },
    { header: t('fittings.variations.price'), value: (row) => row.price },
  ];
}
