import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import { eyebrowClassName, Tooltip } from '@/components/ui';
import { cx } from '@/lib/cx';
import { sectionCompareRows, type CompareRow } from '@/engine/fittings/fittingCompare';
import { FLAG_STATS, STAT_DIGITS } from '@/engine/fittings/fittingStatFields';
import { formatSeconds } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { fixed0, fixed1, fixedFormat } from '@/lib/fixedFormat';
import type { Translate } from '@/lib/translate';
import { flagWord } from './flagWord';

function formatValue(row: CompareRow, index: number, t: Translate): string {
  if (row.key === 'capacitor') {
    const value = row.values[index]!;
    return value >= 0
      ? t('fittings.compare.stat.capacitorStable', { pct: fixed0(value) })
      : t('fittings.compare.stat.capacitorUnstable', { time: formatSeconds(-value) });
  }
  if (FLAG_STATS.has(row.key)) {
    return flagWord(row.values[index]!, t);
  }
  if (row.key === 'appliedDps' || row.key === 'bestRange') return fixed1(row.values[index]!);
  if (row.key === 'priceSell' || row.key === 'priceBuy') {
    const value = row.values[index]!;
    if (Number.isNaN(value)) return '—';
    return formatIsk(value, 0);
  }
  return fixedFormat(STAT_DIGITS[row.key])(row.values[index]!);
}

export interface FittingCompareColumn {
  index: number;
  statsIndex: number | null;
  header: ReactNode;
  name?: string;
}

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
  columns: readonly FittingCompareColumn[];
  differencesOnly: boolean;
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

  const pinned = pinNames && columns.length >= 2 && columns.every((column) => column.name);

  return (
    <table className={COMPARE_TABLE_CLASS}>
      <CompareColGroup count={columns.length} />
      <thead>
        <tr>
          <th scope="col" className="p-2 text-left text-text-dim">
            {t('fittings.compare.statColumn')}
          </th>
          {columns.map((column) => (
            <th key={column.index} scope="col" className="p-2 text-right text-text">
              {column.header}
            </th>
          ))}
        </tr>
        {pinned && (
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
      {sectionCompareRows(shown).map(({ section, rows: sectionRows }) => (
        <tbody key={section}>
          <tr className="border-t border-line">
            <th
              scope="rowgroup"
              colSpan={columns.length + 1}
              className={cx(eyebrowClassName, 'px-2 pt-4 pb-1 text-left')}
            >
              {t(`fittings.compare.section.${section}`)}
            </th>
          </tr>
          {sectionRows.map((row) => (
            <tr key={row.key} className="border-t border-line">
              <th scope="row" className="p-2 text-left font-normal text-text-dim">
                {t(`fittings.compare.stat.${row.key}`)}
              </th>
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
      ))}
    </table>
  );
}
