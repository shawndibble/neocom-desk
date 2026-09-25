/**
 * The stat grid for Fitting vs Fitting compare, one column per Fitting. Best
 * value gets an icon and bold weight, never colour alone (DESIGN.md's
 * damage-type rule already establishes that convention).
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import type { CompareRow } from '@/engine/fittings/fittingCompare';
import { STAT_DIGITS } from '@/engine/fittings/fittingStatFields';

type Translate = (key: string, opts?: Record<string, unknown>) => string;

function formatValue(row: CompareRow, index: number, t: Translate): string {
  if (row.key === 'capacitor') {
    const value = row.values[index]!;
    return value >= 0
      ? t('fittings.compare.stat.capacitorStable', { pct: value.toFixed(0) })
      : t('fittings.compare.stat.capacitorUnstable', { seconds: (-value).toFixed(0) });
  }
  const digits = STAT_DIGITS[row.key];
  return row.values[index]!.toFixed(digits);
}

export interface FittingCompareColumn {
  index: number;
  /** Position in each row's `values`; null when this Fitting's stats couldn't be calculated. */
  statsIndex: number | null;
  header: ReactNode;
}

export interface FittingCompareTableProps {
  rows: readonly CompareRow[];
  /** Which columns to render, and what heads them — the phone pager's window, or every column on desktop. */
  columns: readonly FittingCompareColumn[];
  differencesOnly: boolean;
}

export function FittingCompareTable({ rows, columns, differencesOnly }: FittingCompareTableProps) {
  const { t } = useTranslation();
  const shown = differencesOnly ? rows.filter((row) => row.differs) : rows;

  if (shown.length === 0) {
    return <p className="text-xs text-text-dim">{t('fittings.compare.noDifferences')}</p>;
  }

  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          <th className="p-2 text-left text-text-dim">{t('fittings.compare.statColumn')}</th>
          {columns.map((column) => (
            <th key={column.index} className="p-2 text-right text-text">
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {shown.map((row) => (
          <tr key={row.key} className="border-t border-line">
            <td className="p-2 text-text-dim">{t(`fittings.compare.stat.${row.key}`)}</td>
            {columns.map((column) => {
              const statsIndex = column.statsIndex;
              const best = statsIndex !== null && row.bestIndices.includes(statsIndex);
              return (
                <td
                  key={column.index}
                  className={`p-2 text-right tabular-nums ${best ? 'font-semibold text-text' : 'text-text-dim'}`}
                >
                  {best && (
                    <Icon.Done
                      aria-hidden="true"
                      className="mr-1 inline-block h-3 w-3 align-middle text-success"
                    />
                  )}
                  {statsIndex === null ? '—' : formatValue(row, statsIndex, t)}
                  {best && <span className="sr-only"> {t('fittings.compare.best')}</span>}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
