import { useTranslation } from 'react-i18next';
import { IskAmount, Panel } from '@/components/ui';
import {
  baselineDelta,
  compareDirection,
  headToHeadRows,
  type CompareRow,
} from '@/engine/fittings/fittingCompare';
import { cx } from '@/lib/cx';
import { fixed1 } from '@/lib/fixedFormat';
import { CompareLetterTag } from './CompareFitCard';
import {
  COMPARE_GRID_CLASS,
  DELTA_TONE_CLASS,
  compareGridStyle,
  formatCompareValue,
  formatDelta,
  HEAD_TO_HEAD_UNIT,
  isAbsentValue,
} from './compareFormat';

function barShare(row: CompareRow, index: number): number {
  const value = row.values[index]!;
  if (row.key === 'capacitor') return value >= 0 ? value / 100 : 0;
  const max = Math.max(...row.values.filter((v) => Number.isFinite(v)));
  return max > 0 ? value / max : 0;
}

function Bar({ share, best, bad }: { share: number; best: boolean; bad: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-xs bg-panel-2" aria-hidden="true">
      <div
        className={cx(
          'h-full rounded-xs',
          bad ? 'bg-danger' : best ? 'bg-accent' : 'bg-line-bright'
        )}
        style={{ width: `${Math.max(3, Math.min(1, share) * 100)}%` }}
      />
    </div>
  );
}

function HeadToHeadRow({
  row,
  range,
  letters,
}: {
  row: CompareRow;
  range: CompareRow | undefined;
  letters: readonly string[];
}) {
  const { t } = useTranslation();
  const direction = compareDirection(row.key);
  const unit = HEAD_TO_HEAD_UNIT[row.key];
  const isPrice = row.key === 'priceSell';
  return (
    <div
      role="row"
      className={cx(
        COMPARE_GRID_CLASS,
        'border-t border-line py-2 first:border-t-0 md:items-center'
      )}
      style={compareGridStyle(letters.length)}
    >
      <div role="rowheader" className="mb-1 text-sm font-medium text-text md:mb-0">
        {t(`fittings.compare.headToHead.${row.key}`)}
      </div>
      {letters.map((letter, index) => {
        const absent = isAbsentValue(row, index);
        const best = row.bestIndices.includes(index);
        const bad = row.key === 'capacitor' && row.values[index]! < 0;
        const delta =
          index === 0 || absent || row.key === 'capacitor'
            ? null
            : baselineDelta(row.values[index]!, row.values[0]!, direction);
        return (
          <div role="cell" key={letter} className="flex items-center gap-2 py-0.5 md:block">
            <CompareLetterTag letter={letter} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span
                  className={cx(
                    'tabular-nums',
                    best ? 'font-semibold text-text' : 'text-text',
                    bad && 'text-danger'
                  )}
                >
                  {isPrice && !absent ? (
                    <IskAmount value={row.values[index]!} decimals={0} />
                  ) : (
                    formatCompareValue(row, index, t)
                  )}
                  {unit && !absent && ` ${unit}`}
                  {best && <span className="sr-only"> {t('fittings.compare.best')}</span>}
                </span>
                {row.key === 'appliedDps' && range && !absent && (
                  <span className="text-xs text-text-dim">
                    {t('fittings.compare.atRange', { km: fixed1(range.values[index]!) })}
                  </span>
                )}
                {delta && (
                  <span
                    className={cx('ml-auto text-xs tabular-nums', DELTA_TONE_CLASS[delta.tone])}
                  >
                    {formatDelta(delta)}
                    <span className="sr-only"> {t('fittings.compare.againstBaseline')}</span>
                  </span>
                )}
              </div>
              {!absent && <Bar share={barShare(row, index)} best={best} bad={bad} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CompareHeadToHead({
  rows,
  letters,
}: {
  rows: readonly CompareRow[];
  letters: readonly string[];
}) {
  const { t } = useTranslation();
  const range = rows.find((row) => row.key === 'bestRange');
  return (
    <Panel
      title={t('fittings.compare.headToHeadTitle')}
      metaOwnRow
      meta={<span className="text-xs text-text-dim">{t('fittings.compare.headToHeadNote')}</span>}
    >
      <div role="table" aria-label={t('fittings.compare.headToHeadTitle')}>
        {headToHeadRows(rows).map((row) => (
          <HeadToHeadRow key={row.key} row={row} range={range} letters={letters} />
        ))}
      </div>
    </Panel>
  );
}
