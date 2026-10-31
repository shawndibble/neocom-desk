import type { CsvColumn } from '@/lib/csv';
import { formatSeconds } from '@/lib/duration';
import { joined } from '@/lib/exportSheets';
import { typeNameOr } from '@/lib/typeNameOr';
import type { CompareRow, ModuleDiffEntry } from '@/engine/fittings/fittingCompare';
import type { Translate } from '@/lib/translate';

/** One compared Fitting as an export column. */
export interface FittingCompareCsvFitting {
  name: string;
  /** The header's fit verdict in words ("Fits", "Over by 12 CPU"); null when stats failed or aren't known yet. */
  fits?: string | null;
  /** The header's can-fly verdict in words; null while unknown. */
  canFly?: string | null;
  /** Position in each row's `values`/`counts`; null when this Fitting's stats couldn't be calculated. */
  statsIndex: number | null;
}

/**
 * A header fact (Fits, Can fly): what each Fitting's column header says under its name,
 * as a row of the stats export, so the file holds what the screen holds.
 */
export interface FittingFactRow {
  fact: 'fits' | 'canFly';
}

/** One row of the Stats export: a stat, or a header fact. */
export type FittingCompareCsvRow = CompareRow | FittingFactRow;

function isFactRow(row: FittingCompareCsvRow): row is FittingFactRow {
  return 'fact' in row;
}

/**
 * Export columns for Fitting vs Fitting's Stats table: the stat, then one
 * column per Fitting — every Fitting, not the phone pager's window. Values
 * are the engine row's own (already rounded as displayed) numbers; a failed
 * price (NaN) and a Fitting whose stats failed both export blank. Capacitor
 * is the exception and exports as the table words it: its sign encodes
 * stable-at-% vs depletes-in-seconds, which a bare number would hide.
 */
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
          ? // fixed format: CSV
            t('fittings.compare.stat.capacitorStable', { pct: value.toFixed(0) })
          : t('fittings.compare.stat.capacitorUnstable', { time: formatSeconds(-value) });
      },
    })),
    {
      // The table marks the best Fitting per stat; here the names, `; `-joined for a tie.
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

/** Export columns for "Modules that differ": the module, then its count in each Fitting. */
export function fittingCompareModulesCsvColumns(
  t: Translate,
  names: ReadonlyMap<number, string>,
  fittings: readonly FittingCompareCsvFitting[]
): CsvColumn<ModuleDiffEntry>[] {
  return [
    {
      header: t('fittings.compare.moduleColumn'),
      value: (entry) => typeNameOr(t, names.get(entry.typeId), entry.typeId),
    },
    ...fittings.map(({ name, statsIndex }): CsvColumn<ModuleDiffEntry> => ({
      header: name,
      value: (entry) => (statsIndex === null ? null : (entry.counts[statsIndex] ?? 0)),
    })),
  ];
}
