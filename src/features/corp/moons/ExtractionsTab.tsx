import { useNavigate } from 'react-router-dom';
import { caretColumn } from './caretColumn';
import { useTranslation } from 'react-i18next';
import { DataTable, Panel, StatChip, StatChips, type DataTableColumn } from '@/components/ui';
import type { ExtractionRow } from '@/engine/corpTaxBook/bookView';
import { useBook } from './useBook';
import { ExtractionTimeline } from './ExtractionTimeline';
import { isk, shortDate, shortDateTime } from './moonsFormat';
import { extractionPath } from './moonsPaths';
import { MinedBar, OreLine, StateWord } from './moonsParts';

export function ExtractionsTab() {
  const { t } = useTranslation();
  const { view, names } = useBook();
  const navigate = useNavigate();
  const rows = view.extractions;
  const count = (state: ExtractionRow['state']) => rows.filter((r) => r.state === state).length;
  const inChunks = rows
    .filter((r) => r.state !== 'expired' && r.state !== 'cancelled')
    .reduce((sum, r) => sum + (r.estimatedValue ?? 0), 0);

  const columns: DataTableColumn<ExtractionRow>[] = [
    {
      id: 'moon',
      header: t('corpTaxBook.moons.cols.moon'),
      primary: true,
      render: (row) => (
        <span className="block min-w-0">
          <span className="text-accent">{names.refinery(row.structureId)}</span>
          <span className="block text-xs text-text-dim">{names.moon(row.moonId)}</span>
        </span>
      ),
      sortValue: (row) => names.refinery(row.structureId),
    },
    {
      id: 'state',
      header: t('corpTaxBook.moons.cols.state'),
      render: (row) => <StateWord state={row.state} />,
    },
    {
      id: 'when',
      header: t('corpTaxBook.moons.cols.when'),
      render: (row) => (
        <span className="block">
          {shortDateTime(row.fracturedAt ?? row.chunkArrivalAt)}
          <span className="block text-xs text-text-dim">
            {t('corpTaxBook.moons.startedOn', { date: shortDate(row.startedAt) })}
          </span>
        </span>
      ),
      sortValue: (row) => row.chunkArrivalAt,
    },
    { id: 'ore', header: t('corpTaxBook.moons.cols.ore'), render: (row) => <OreLine row={row} /> },
    {
      id: 'isk',
      header: t('corpTaxBook.moons.cols.estValue'),
      align: 'right',
      className: 'tabular-nums',
      render: (row) => (row.estimatedValue ? isk(row.estimatedValue) : '—'),
      sortValue: (row) => row.estimatedValue ?? 0,
    },
    {
      id: 'mined',
      header: t('corpTaxBook.moons.cols.mined'),
      render: (row) => <MinedBar pct={row.minedPct} label={names.refinery(row.structureId)} />,
    },
    caretColumn<ExtractionRow>(),
  ];

  return (
    <div className="space-y-4">
      <StatChips>
        <StatChip
          label={t('corpTaxBook.moons.state.ready')}
          value={String(count('ready'))}
          tone="success"
        />
        <StatChip
          label={t('corpTaxBook.moons.state.fractured')}
          value={String(count('fractured'))}
          tone="warning"
        />
        <StatChip
          label={t('corpTaxBook.moons.state.extracting')}
          value={String(count('extracting'))}
        />
        <StatChip
          label={t('corpTaxBook.moons.chips.inChunks')}
          value={isk(inChunks)}
          emphasis
          tooltip={t('corpTaxBook.moons.chips.inChunksTip')}
          tooltipGlyph="info"
        />
      </StatChips>
      <Panel
        title={t('corpTaxBook.moons.timeline.title')}
        meta={<span className="text-xs text-text-dim">{t('corpTaxBook.moons.timeline.hint')}</span>}
      >
        <ExtractionTimeline rows={rows} />
      </Panel>
      <Panel title={t('corpTaxBook.moons.tabs.extractions')} padded={false}>
        <DataTable
          label={t('corpTaxBook.moons.tabs.extractions')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          onRowClick={(row) => navigate(extractionPath(row.id))}
          rowClassName={() => 'group'}
          defaultSort={{ columnId: 'when', direction: 'desc' }}
          mobileSort
          stackColumns={2}
          stackSummary={t('corpTaxBook.moons.extractionsSummary', { count: rows.length })}
        />
      </Panel>
    </div>
  );
}
