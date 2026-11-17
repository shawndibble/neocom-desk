import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DataTable, EmptyState, PageHeader, type DataTableColumn } from '@/components/ui';
import type { ExtractionRow } from '@/engine/corpTaxBook/bookView';
import { splitPlace } from '@/engine/corpTaxBook/bookSections';
import { moonExtractions } from '@/engine/corpTaxBook/moonRows';
import { useBook } from './useBook';
import { caretColumn } from './caretColumn';
import { isk, shortDate, shortDateTime } from './moonsFormat';
import { extractionPath, moonsTabPath } from './moonsPaths';
import { Crumb, MinedBar, OreLine, StateWord } from './moonsParts';
import { UndockableChip } from './sectionParts';

/**
 * One moon's page (#6299): every Extraction the book synced for it, future and past, newest
 * first. A row opens that Extraction's own page.
 */
export function MoonPage({ moonId }: { moonId: number }) {
  const { t } = useTranslation();
  const { view, names } = useBook();
  const navigate = useNavigate();
  const rows = moonExtractions(view.extractions, moonId);
  const crumb = <Crumb to={moonsTabPath} label={t('corpTaxBook.moons.tabs.moons')} />;
  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        {crumb}
        <EmptyState title={t('corpTaxBook.moons.moons.notFound')} />
      </div>
    );
  }
  const structureId = rows[0].structureId;
  const place = splitPlace(names.refinery(structureId), names.moon(moonId));

  const columns: DataTableColumn<ExtractionRow>[] = [
    {
      id: 'state',
      header: t('corpTaxBook.moons.cols.state'),
      primary: true,
      render: (row) => (
        <span className="block">
          <StateWord state={row.state} />
          <span className="block text-xs text-text-dim">
            {t('corpTaxBook.moons.startedOn', { date: shortDate(row.startedAt) })}
          </span>
        </span>
      ),
      sortValue: (row) => row.startedAt,
    },
    {
      id: 'pop',
      header: t('corpTaxBook.moons.cols.pop'),
      render: (row) => shortDateTime(row.chunkArrivalAt),
      sortValue: (row) => row.chunkArrivalAt,
    },
    {
      id: 'fractured',
      header: t('corpTaxBook.moons.cols.fractured'),
      render: (row) =>
        row.fracturedAt ? (
          <span className="block">
            {shortDateTime(row.fracturedAt)}
            {row.fracturedBy && (
              <span className="block text-xs text-text-dim">
                {t(`corpTaxBook.moons.moons.by.${row.fracturedBy}`)}
              </span>
            )}
          </span>
        ) : (
          '—'
        ),
      sortValue: (row) => row.fracturedAt,
    },
    {
      id: 'ore',
      header: t('corpTaxBook.moons.cols.ore'),
      render: (row) => <OreLine row={row} />,
    },
    {
      id: 'mined',
      header: t('corpTaxBook.moons.cols.mined'),
      render: (row) => <MinedBar pct={row.minedPct} label={place.moon ?? place.station} />,
      sortValue: (row) => row.minedPct ?? undefined,
    },
    {
      id: 'tax',
      header: t('corpTaxBook.moons.cols.tax'),
      align: 'right',
      className: 'tabular-nums',
      render: (row) => (row.tax ? isk(row.tax) : '—'),
      sortValue: (row) => row.tax,
    },
    caretColumn<ExtractionRow>(),
  ];

  return (
    <div className="space-y-4">
      {crumb}
      <PageHeader
        title={place.moon ?? place.station}
        meta={
          <span className="flex items-center gap-2 text-xs text-text-dim">
            {place.moon !== undefined && place.station}
            {names.undockable?.(structureId) && <UndockableChip />}
          </span>
        }
      />
      <div className="overflow-x-auto">
        <DataTable
          label={t('corpTaxBook.moons.tabs.extractions')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          onRowClick={(row) => navigate(extractionPath(row.id))}
          defaultSort={{ columnId: 'state', direction: 'desc' }}
          mobileSort
          stackColumns={2}
          stackSummary={t('corpTaxBook.moons.extractionsSummary', { count: rows.length })}
        />
      </div>
      {rows.length === 1 && (
        <p className="text-sm text-text-dim">{t('corpTaxBook.moons.moons.emptyHistory')}</p>
      )}
    </div>
  );
}
