import { useTranslation } from 'react-i18next';
import { Panel, ProgressBar } from '@/components/ui';
import { headToHeadRows, type CompareRow } from '@/engine/fittings/fittingCompare';
import { cx } from '@/lib/cx';
import { fixed1 } from '@/lib/fixedFormat';
import { CompareLetterTag, CompareValue } from './CompareCell';
import {
  COMPARE_GRID_CLASS,
  compareGridStyle,
  isAbsentValue,
  type CompareColumn,
} from './compareFormat';

function barShare(row: CompareRow, position: number): number {
  const value = row.values[position]!;
  if (row.key === 'capacitor') return value >= 0 ? value / 100 : 0.03;
  const max = Math.max(...row.values.filter((v) => Number.isFinite(v)));
  return max > 0 ? Math.max(0.03, value / max) : 0.03;
}

function HeadToHeadRow({
  row,
  range,
  columns,
}: {
  row: CompareRow;
  range: CompareRow | undefined;
  columns: readonly CompareColumn[];
}) {
  const { t } = useTranslation();
  const label = t(`fittings.compare.headToHead.${row.key}`);
  return (
    <div
      role="row"
      className={cx(
        COMPARE_GRID_CLASS,
        'border-t border-line py-2 first:border-t-0 md:items-center'
      )}
      style={compareGridStyle(columns.length)}
    >
      <div role="rowheader" className="mb-1 text-sm font-medium text-text md:mb-0">
        {label}
      </div>
      {columns.map((column) => {
        const { position } = column;
        const absent = isAbsentValue(row, position);
        const best = position !== null && row.bestIndices.includes(position);
        const unstable = row.key === 'capacitor' && !absent && row.values[position!]! < 0;
        return (
          <div role="cell" key={column.letter} className="flex items-center gap-2 py-0.5 md:block">
            <CompareLetterTag letter={column.letter} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <CompareValue row={row} column={column} withUnit deltaClassName="ml-auto">
                  {row.key === 'appliedDps' && range && !absent && (
                    <span className="text-xs text-text-dim">
                      {t('fittings.compare.atRange', { km: fixed1(range.values[position!]!) })}
                    </span>
                  )}
                </CompareValue>
              </div>
              {!absent && (
                <ProgressBar
                  label={label}
                  value={barShare(row, position!) * 100}
                  tone={unstable ? 'danger' : best ? 'accent' : 'neutral'}
                  decorative
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CompareHeadToHead({
  rows,
  columns,
}: {
  rows: readonly CompareRow[];
  columns: readonly CompareColumn[];
}) {
  const { t } = useTranslation();
  const range = rows.find((row) => row.key === 'bestRange');
  return (
    <Panel
      title={t('fittings.compare.headToHeadTitle')}
      meta={t('fittings.compare.headToHeadNote')}
      metaOwnRow
    >
      <div role="table" aria-label={t('fittings.compare.headToHeadTitle')}>
        {headToHeadRows(rows).map((row) => (
          <HeadToHeadRow key={row.key} row={row} range={range} columns={columns} />
        ))}
      </div>
    </Panel>
  );
}
