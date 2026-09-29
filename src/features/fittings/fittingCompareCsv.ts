import type { CsvColumn } from '@/lib/csv';
import type { CompareRow, ModuleDiffEntry } from '@/engine/fittings/fittingCompare';

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** One compared Fitting as an export column. */
export interface FittingCompareCsvFitting {
  name: string;
  /** Position in each row's `values`/`counts`; null when this Fitting's stats couldn't be calculated. */
  statsIndex: number | null;
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
): CsvColumn<CompareRow>[] {
  return [
    {
      header: t('fittings.compare.statColumn'),
      value: (row) => t(`fittings.compare.stat.${row.key}`),
    },
    ...fittings.map(({ name, statsIndex }): CsvColumn<CompareRow> => ({
      header: name,
      value: (row) => {
        if (statsIndex === null) return null;
        const value = row.values[statsIndex];
        if (value === undefined) return null;
        if (row.key !== 'capacitor') return value;
        return value >= 0
          ? t('fittings.compare.stat.capacitorStable', { pct: value.toFixed(0) })
          : t('fittings.compare.stat.capacitorUnstable', { seconds: (-value).toFixed(0) });
      },
    })),
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
      value: (entry) => names.get(entry.typeId) ?? t('common.unknownType', { id: entry.typeId }),
    },
    ...fittings.map(({ name, statsIndex }): CsvColumn<ModuleDiffEntry> => ({
      header: name,
      value: (entry) => (statsIndex === null ? null : (entry.counts[statsIndex] ?? 0)),
    })),
  ];
}
