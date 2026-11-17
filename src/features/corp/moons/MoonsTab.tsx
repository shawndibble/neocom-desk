import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DataTable, EmptyState, Panel, type DataTableColumn } from '@/components/ui';
import { moonRows, type MoonRow } from '@/engine/corpTaxBook/moonRows';
import { useBook } from './useBook';
import { caretColumn } from './caretColumn';
import { FILTER_STATES } from './extractionStates';
import { isk, shortDateTime } from './moonsFormat';
import { moonPath } from './moonsPaths';
import { PlaceCell } from './sectionParts';

/** Every moon the book knows (#6299): one row each, opening the moon's Extractions. */
export function MoonsTab() {
  const { t } = useTranslation();
  const { view, names, corporationId } = useBook();
  const navigate = useNavigate();
  const rows = moonRows(view.extractions);
  // A book that reads moon owners' Extractions names each moon's corporation (#6097).
  const namesCorporations = view.extractions.some((x) => x.sourceCorporationId !== undefined);
  const states = (row: MoonRow) =>
    FILTER_STATES.filter((s) => row.states[s])
      .map((s) => `${row.states[s]} ${t(`corpTaxBook.moons.state.${s}`)}`)
      .join(' · ');

  const columns: DataTableColumn<MoonRow>[] = [
    {
      id: 'moon',
      header: t('corpTaxBook.moons.cols.moon'),
      primary: true,
      render: (row) => (
        <PlaceCell
          refinery={names.refinery(row.structureId)}
          undockable={names.undockable?.(row.structureId)}
          moon={names.moon(row.moonId)}
          to={moonPath(row.moonId)}
        />
      ),
      sortValue: (row) => names.moon(row.moonId) ?? names.refinery(row.structureId),
    },
    ...(namesCorporations
      ? [
          {
            id: 'owner',
            header: t('corpTaxBook.moons.cols.owner'),
            render: (row: MoonRow) => names.corporation(row.sourceCorporationId ?? corporationId),
            sortValue: (row: MoonRow) =>
              names.corporation(row.sourceCorporationId ?? corporationId),
          },
        ]
      : []),
    {
      id: 'extractions',
      header: t('corpTaxBook.moons.tabs.extractions'),
      render: (row) => (
        <span className="block">
          {row.extractionCount}
          <span className="block text-xs text-text-dim">{states(row)}</span>
        </span>
      ),
      sortValue: (row) => row.extractionCount,
    },
    {
      id: 'pop',
      header: t('corpTaxBook.moons.cols.pop'),
      render: (row) =>
        row.nextPopAt
          ? t('corpTaxBook.moons.moons.nextPop', { date: shortDateTime(row.nextPopAt) })
          : row.lastPopAt
            ? t('corpTaxBook.moons.moons.lastPop', { date: shortDateTime(row.lastPopAt) })
            : '—',
      sortValue: (row) => row.nextPopAt ?? row.lastPopAt,
    },
    {
      id: 'tax',
      header: t('corpTaxBook.moons.cols.tax'),
      align: 'right',
      className: 'tabular-nums',
      render: (row) => (row.tax ? isk(row.tax) : '—'),
      sortValue: (row) => row.tax,
    },
    caretColumn<MoonRow>(),
  ];

  return (
    <Panel title={t('corpTaxBook.moons.tabs.moons')} padded={false}>
      {rows.length === 0 ? (
        <EmptyState title={t('corpTaxBook.moons.moons.none')} />
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            label={t('corpTaxBook.moons.tabs.moons')}
            columns={columns}
            rows={rows}
            rowKey={(row) => String(row.moonId)}
            onRowClick={(row) => navigate(moonPath(row.moonId))}
            defaultSort={{ columnId: 'moon', direction: 'asc' }}
            mobileSort
            stackColumns={2}
            stackSummary={t('corpTaxBook.moons.moons.summary', { count: rows.length })}
          />
        </div>
      )}
    </Panel>
  );
}
