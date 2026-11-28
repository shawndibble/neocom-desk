import type { CsvColumn } from '@/lib/csv';
import { formatSeconds } from '@/lib/duration';
import { joined } from '@/lib/exportSheets';
import type { CompareRow } from '@/engine/fittings/fittingCompare';
import type { Translate } from '@/lib/translate';

export interface FittingCompareCsvFitting {
  name: string;
  fits?: string | null;
  canFly?: string | null;
  statsIndex: number | null;
}

export interface FittingFactRow {
  fact: 'fits' | 'canFly';
}

export type FittingCompareCsvRow = CompareRow | FittingFactRow;

function isFactRow(row: FittingCompareCsvRow): row is FittingFactRow {
  return 'fact' in row;
}

export function fittingCompareCsvColumns(
  t: Translate,
  fittings: readonly FittingCompareCsvFitting[]
): CsvColumn<FittingCompareCsvRow>[] {
  return [
    {
      header: t('fittings.compare.statColumn'),
      value: (row) =>
        isFactRow(row)
          ? t(row.fact === 'fits' ? 'fittings.compare.csvFitsRow' : 'fittings.compare.csvCanFlyRow')
          : t(`fittings.compare.stat.${row.key}`),
    },
    ...fittings.map(({ name, statsIndex, fits, canFly }): CsvColumn<FittingCompareCsvRow> => ({
      header: name,
      value: (row) => {
        if (isFactRow(row)) return (row.fact === 'fits' ? fits : canFly) ?? null;
        if (statsIndex === null) return null;
        const value = row.values[statsIndex];
        if (value === undefined) return null;
        if (row.key !== 'capacitor') return value;
        return value >= 0
          ? t('fittings.compare.stat.capacitorStable', { pct: value.toFixed(0) })
          : t('fittings.compare.stat.capacitorUnstable', { time: formatSeconds(-value) });
      },
    })),
    {
      header: t('fittings.compare.csvBestColumn'),
      value: (row) => {
        if (isFactRow(row) || row.bestIndices.length === 0) return null;
        return joined(
          fittings
            .filter(({ statsIndex }) => statsIndex !== null && row.bestIndices.includes(statsIndex))
            .map(({ name }) => name)
        );
      },
    },
  ];
}
