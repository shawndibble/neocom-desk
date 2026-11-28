import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CollapsiblePanel } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import {
  sectionCompareRows,
  type CompareRow,
  type CompareSectionId,
} from '@/engine/fittings/fittingCompare';
import type { FittingStats } from '@/engine/fittings/types';
import { cx } from '@/lib/cx';
import { CompareLetterTag, CompareValue } from './CompareCell';
import { COMPARE_GRID_CLASS, compareGridStyle, type CompareColumn } from './compareFormat';
import { ResistTable } from './stats/ResistTable';

const OPEN_AT_START: ReadonlySet<CompareSectionId> = new Set(['fitting', 'offence', 'tank']);

function StatLine({ row, columns }: { row: CompareRow; columns: readonly CompareColumn[] }) {
  const { t } = useTranslation();
  return (
    <div
      role="row"
      className={cx(COMPARE_GRID_CLASS, 'border-t border-line py-1.5 text-sm first:border-t-0')}
      style={compareGridStyle(columns.length)}
    >
      <div role="rowheader" className="text-text-dim">
        {t(`fittings.compare.stat.${row.key}`)}
      </div>
      {columns.map((column) => (
        <div role="cell" key={column.letter} className="flex items-baseline gap-2">
          <CompareLetterTag letter={column.letter} />
          <CompareValue row={row} column={column} />
        </div>
      ))}
    </div>
  );
}

function ResistLine({
  statsList,
  columns,
}: {
  statsList: readonly FittingStats[];
  columns: readonly CompareColumn[];
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cx(COMPARE_GRID_CLASS, 'py-1.5 md:items-start')}
      style={compareGridStyle(columns.length)}
    >
      <div className="hidden md:block" />
      {columns.map(({ letter, position }) => {
        const stats = position === null ? undefined : statsList[position];
        return (
          <div key={letter} className="flex gap-2 py-1 md:block">
            <CompareLetterTag letter={letter} />
            <div className="min-w-0 flex-1">
              {stats ? (
                <ResistTable
                  rows={[
                    { key: 'shield', label: t('fittings.stats.shield'), resonances: stats.shield },
                    { key: 'armor', label: t('fittings.stats.armor'), resonances: stats.armor },
                    { key: 'hull', label: t('fittings.stats.hull'), resonances: stats.hull },
                  ]}
                />
              ) : (
                <span className="text-text-dim">—</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CompareAllStats({
  rows,
  statsList,
  columns,
  differencesOnly,
  onShowMatching,
}: {
  rows: readonly CompareRow[];
  statsList: readonly FittingStats[];
  columns: readonly CompareColumn[];
  differencesOnly: boolean;
  onShowMatching: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<ReadonlySet<CompareSectionId>>(OPEN_AT_START);
  const sections = sectionCompareRows(rows);
  if (differencesOnly && !rows.some((row) => row.differs))
    return <p className="text-xs text-text-dim">{t('fittings.compare.noDifferences')}</p>;
  return (
    <div className="space-y-2">
      {sections.map(({ section, rows: own }) => {
        const differing = own.filter((row) => row.differs).length;
        const shown = differencesOnly ? own.filter((row) => row.differs) : own;
        if (shown.length === 0) return null;
        const hidden = own.length - shown.length;
        const matching = own.length - differing;
        const expanded = open.has(section);
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
            collapsedSummary={
              matching > 0
                ? t('fittings.compare.sectionSummaryMatching', { count: differing, matching })
                : t('fittings.compare.sectionSummary', { count: differing })
            }
          >
            {section === 'resists' ? (
              <ResistLine statsList={statsList} columns={columns} />
            ) : (
              <div role="table" aria-label={t(`fittings.compare.section.${section}`)}>
                {shown.map((row) => (
                  <StatLine key={row.key} row={row} columns={columns} />
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
