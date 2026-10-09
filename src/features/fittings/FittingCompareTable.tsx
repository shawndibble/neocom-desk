/**
 * The stat grid for Fitting vs Fitting compare, one column per Fitting. Best
 * value gets an icon and bold weight, never colour alone (DESIGN.md's
 * damage-type rule already establishes that convention).
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import { Tooltip } from '@/components/ui';
import type { CompareRow } from '@/engine/fittings/fittingCompare';
import { STAT_DIGITS } from '@/engine/fittings/fittingStatFields';
import { formatSeconds } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';

type Translate = (key: string, opts?: Record<string, unknown>) => string;

function formatValue(row: CompareRow, index: number, t: Translate): string {
  if (row.key === 'capacitor') {
    const value = row.values[index]!;
    return value >= 0
      ? t('fittings.compare.stat.capacitorStable', { pct: value.toFixed(0) })
      : t('fittings.compare.stat.capacitorUnstable', { time: formatSeconds(-value) });
  }
  if (row.key === 'appliedDps' || row.key === 'bestRange') return row.values[index]!.toFixed(1);
  if (row.key === 'priceSell' || row.key === 'priceBuy') {
    const value = row.values[index]!;
    // NaN marks a slot whose price fetch failed — the engine row still carries it so the other
    // slots' prices can show, but there's nothing to format here.
    if (Number.isNaN(value)) return '—';
    // Whole ISK, same rounding the engine row was built at, so what's shown always matches what `differs` compared.
    return formatIsk(value, 0);
  }
  return row.values[index]!.toFixed(STAT_DIGITS[row.key]);
}

export interface FittingCompareColumn {
  index: number;
  /** Position in each row's `values`; null when this Fitting's stats couldn't be calculated. */
  statsIndex: number | null;
  header: ReactNode;
  /** The Fitting's plain name, for the slim row pinned over the stat rows at `md` and up. */
  name?: string;
}

/**
 * Table classes + column group shared by the Stats and "Modules that differ" tables, so a Fitting's
 * column sits at the same x in both (fixed layout from `sm` up; the phone keeps auto layout).
 */
export const COMPARE_TABLE_CLASS = 'w-full border-collapse text-xs sm:table-fixed';

export function CompareColGroup({ count }: { count: number }) {
  return (
    <colgroup>
      <col className="sm:w-2/5" />
      {Array.from({ length: count }, (_, i) => (
        <col key={i} />
      ))}
    </colgroup>
  );
}

export interface FittingCompareTableProps {
  rows: readonly CompareRow[];
  /** Which columns to render, and what heads them — the phone pager's window, or every column on desktop. */
  columns: readonly FittingCompareColumn[];
  differencesOnly: boolean;
  /** Pin a slim row of Fitting names under the top edge while the stat rows scroll (not on the phone, whose pager header stays put). */
  pinNames?: boolean;
}

export function FittingCompareTable({
  rows,
  columns,
  differencesOnly,
  pinNames = false,
}: FittingCompareTableProps) {
  const { t } = useTranslation();
  const shown = differencesOnly ? rows.filter((row) => row.differs) : rows;

  if (shown.length === 0) {
    return <p className="text-xs text-text-dim">{t('fittings.compare.noDifferences')}</p>;
  }

  // Only worth a second header line once there is a second column to tell apart.
  const pinned = pinNames && columns.length >= 2 && columns.every((column) => column.name);

  return (
    <table className={COMPARE_TABLE_CLASS}>
      <CompareColGroup count={columns.length} />
      <thead>
        <tr>
          <th className="p-2 text-left text-text-dim">{t('fittings.compare.statColumn')}</th>
          {columns.map((column) => (
            <th key={column.index} className="p-2 text-right text-text">
              {column.header}
            </th>
          ))}
        </tr>
        {pinned && (
          // The tall header above scrolls away; this one-line strip stays under the top edge so a
          // column of bare numbers never loses its Fitting. Its own cells carry the sticky (a
          // sticky `tr` is unreliable) and an opaque background so rows don't show through.
          <tr data-testid="compare-pinned-names" aria-hidden="true">
            <th className="sticky top-0 z-10 border-b border-line bg-panel p-2 text-left font-normal text-text-dim">
              {t('fittings.compare.statColumn')}
            </th>
            {columns.map((column) => (
              <th
                key={column.index}
                className="sticky top-0 z-10 border-b border-line bg-panel p-2 text-right font-medium text-text"
              >
                <Tooltip content={column.name}>
                  <span className="block truncate">{column.name}</span>
                </Tooltip>
              </th>
            ))}
          </tr>
        )}
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
