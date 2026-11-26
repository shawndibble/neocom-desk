import type { CsvColumn } from '@/lib/csv';
import { formatSeconds } from '@/lib/duration';
import type { SwapChange } from '@/engine/fittings/swapChanges';
import { type StatChange, FLAG_STATS, STAT_DIGITS } from '@/engine/fittings/variationDelta';
import type { VariationRow } from './useModuleVariations';
import { fixed0 } from '@/lib/fixedFormat';
import type { Translate } from '@/lib/translate';
import { flagWord } from './flagWord';

function formatDelta(change: StatChange): number {
  const digits = STAT_DIGITS[change.key];
  const factor = 10 ** digits;
  return Math.round((change.after - change.before) * factor) / factor;
}

export function changeLabel(change: StatChange, t: Translate): string {
  if (change.key === 'capacitor') {
    return change.after >= 0
      ? t('fittings.variations.stat.capacitorStable', { pct: fixed0(change.after) })
      : t('fittings.variations.stat.capacitorUnstable', {
          time: formatSeconds(-change.after),
        });
  }
  if (FLAG_STATS.has(change.key)) {
    return t(`fittings.variations.stat.${change.key}`, {
      value: `${flagWord(change.before, t)} → ${flagWord(change.after, t)}`,
    });
  }
  const delta = formatDelta(change);
  const value = delta > 0 ? `+${delta}` : `${delta}`;
  return t(`fittings.variations.stat.${change.key}`, { value });
}

export function swapChangeLabel({ kind, change }: SwapChange, t: Translate): string {
  return kind === 'role'
    ? t(`fittings.whatToTrain.role.${change.key}`, { before: change.before, after: change.after })
    : changeLabel(change, t);
}

export function fittingVariationsCsvColumns(t: Translate): CsvColumn<VariationRow>[] {
  return [
    { header: t('fittings.variations.name'), value: (row) => row.name },
    { header: t('fittings.variations.tier'), value: (row) => row.metaGroupName },
    {
      header: t('fittings.variations.changes'),
      value: (row) => {
        if (row.delta === null) return null;
        if (row.delta.length === 0) return t('fittings.variations.noChanges');
        return row.delta.map((change) => swapChangeLabel(change, t)).join('; ');
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
