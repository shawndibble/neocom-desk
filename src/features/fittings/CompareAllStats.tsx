import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CollapsiblePanel } from '@/components/ui';
import {
  baselineDelta,
  compareDirection,
  sectionCompareRows,
  type CompareRow,
  type CompareSectionId,
} from '@/engine/fittings/fittingCompare';
import type { FittingStats } from '@/engine/fittings/types';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { CompareLetterTag } from './CompareFitCard';
import {
  COMPARE_GRID_CLASS,
  DELTA_TONE_CLASS,
  compareGridStyle,
  formatCompareValue,
  formatDelta,
  isAbsentValue,
} from './compareFormat';
import { ResistTable } from './stats/ResistTable';

const OPEN_AT_START: ReadonlySet<CompareSectionId> = new Set(['fitting', 'offence', 'tank']);

function StatLine({ row, letters }: { row: CompareRow; letters: readonly string[] }) {
  const { t } = useTranslation();
  const direction = compareDirection(row.key);
  return (
    <div
      role="row"
      className={cx(COMPARE_GRID_CLASS, 'border-t border-line py-1.5 text-sm first:border-t-0')}
      style={compareGridStyle(letters.length)}
    >
      <div role="rowheader" className="text-text-dim">
        {t(`fittings.compare.stat.${row.key}`)}
      </div>
      {letters.map((letter, index) => {
        const absent = isAbsentValue(row, index);
        const best = row.bestIndices.includes(index);
        const delta =
          index === 0 || absent || isAbsentValue(row, 0) || row.key === 'capacitor'
            ? null
            : baselineDelta(row.values[index]!, row.values[0]!, direction);
        return (
          <div role="cell" key={letter} className="flex items-baseline gap-2">
            <CompareLetterTag letter={letter} />
            <span
              className={cx(
                'tabular-nums',
                absent ? 'text-text-dim' : best ? 'font-semibold text-text' : 'text-text'
              )}
            >
              {formatCompareValue(row, index, t)}
              {best && <span className="sr-only"> {t('fittings.compare.best')}</span>}
            </span>
            {delta && (
              <span className={cx('text-xs tabular-nums', DELTA_TONE_CLASS[delta.tone])}>
                {formatDelta(delta)}
                <span className="sr-only"> {t('fittings.compare.againstBaseline')}</span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ResistLine({
  statsList,
  letters,
}: {
  statsList: readonly FittingStats[];
  letters: readonly string[];
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cx(COMPARE_GRID_CLASS, 'py-1.5 md:items-start')}
      style={compareGridStyle(letters.length)}
    >
      <div className="hidden md:block" />
      {statsList.map((stats, index) => (
        <div key={letters[index]} className="flex gap-2 py-1 md:block">
          <CompareLetterTag letter={letters[index]!} />
          <div className="min-w-0 flex-1">
            <ResistTable
              rows={[
                { key: 'shield', label: t('fittings.stats.shield'), resonances: stats.shield },
                { key: 'armor', label: t('fittings.stats.armor'), resonances: stats.armor },
                { key: 'hull', label: t('fittings.stats.hull'), resonances: stats.hull },
              ]}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CompareAllStats({
  rows,
  statsList,
  letters,
  differencesOnly,
  onShowMatching,
}: {
  rows: readonly CompareRow[];
  statsList: readonly FittingStats[];
  letters: readonly string[];
  differencesOnly: boolean;
  onShowMatching: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<ReadonlySet<CompareSectionId>>(OPEN_AT_START);
  const sections = sectionCompareRows(rows);
  const anyShown = sections.some(({ rows: own }) => own.some((row) => row.differs));
  if (differencesOnly && !anyShown)
    return <p className="text-xs text-text-dim">{t('fittings.compare.noDifferences')}</p>;
  return (
    <div className="space-y-2">
      {sections.map(({ section, rows: own }) => {
        const shown = differencesOnly ? own.filter((row) => row.differs) : own;
        if (shown.length === 0) return null;
        const hidden = own.length - shown.length;
        const expanded = open.has(section);
        const summary =
          hidden > 0
            ? t('fittings.compare.sectionSummaryHidden', { count: shown.length, hidden })
            : t('fittings.compare.sectionSummary', { count: shown.length });
        return (
          <CollapsiblePanel
            key={section}
            title={t(`fittings.compare.section.${section}`)}
            expanded={expanded}
            onToggle={() =>
              setOpen((prev) => {
                const next = new Set(prev);
                if (expanded) next.delete(section);
                else next.add(section);
                return next;
              })
            }
            collapsedSummary={<span className="text-xs text-text-dim">{summary}</span>}
          >
            {section === 'resists' ? (
              <ResistLine statsList={statsList} letters={letters} />
            ) : (
              <div role="table" aria-label={t(`fittings.compare.section.${section}`)}>
                {shown.map((row) => (
                  <StatLine key={row.key} row={row} letters={letters} />
                ))}
              </div>
            )}
            {hidden > 0 && section !== 'resists' && (
              <p className="mt-1 border-t border-line pt-2 text-xs text-text-dim">
                {t('fittings.compare.matchingHidden', { count: hidden })}{' '}
                <button type="button" className={inlineLinkClassName} onClick={onShowMatching}>
                  {t('fittings.compare.showMatching')}
                </button>
              </p>
            )}
          </CollapsiblePanel>
        );
      })}
    </div>
  );
}
