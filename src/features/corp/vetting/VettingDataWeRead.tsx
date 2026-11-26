import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DataTable, Panel, textActionClassName, type DataTableColumn } from '@/components/ui';
import { VETTING_RAW_SOURCES, type VettingRawSource } from '@/engine/vetting';
import { formatCount } from '@/lib/formatCount';
import { dataPath } from './vettingTabs';

interface Line {
  id: VettingRawSource;
  rows: number;
}

export function VettingDataWeRead({
  tab,
  reviewId,
  counts,
}: {
  tab: 'open' | 'decided';
  reviewId: string;
  counts: Record<VettingRawSource, number>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const lines: Line[] = VETTING_RAW_SOURCES.map((id) => ({ id, rows: counts[id] }));
  const columns: DataTableColumn<Line>[] = [
    {
      id: 'source',
      header: t('vetting.dataWeRead.source'),
      primary: true,
      stickyStart: true,
      stickyStartOnPanel: true,
      render: (row) => (
        <Link to={dataPath(tab, reviewId, row.id)} className={textActionClassName()}>
          {t(`vetting.data.source.${row.id}`)}
        </Link>
      ),
    },
    {
      id: 'rows',
      header: t('vetting.dataWeRead.rows'),
      align: 'right',
      className: 'tabular-nums',
      render: (row) => formatCount(row.rows),
    },
  ];
  return (
    <Panel
      title={t('vetting.data.title')}
      meta={t('vetting.dataWeRead.total', {
        count: lines.reduce((sum, line) => sum + line.rows, 0),
        total: formatCount(lines.reduce((sum, line) => sum + line.rows, 0)),
      })}
      padded={false}
    >
      <div className="overflow-x-auto">
        <DataTable
          label={t('vetting.data.title')}
          columns={columns}
          rows={lines}
          rowKey={(row) => row.id}
          onRowClick={(row) => navigate(dataPath(tab, reviewId, row.id))}
          responsive="table"
        />
      </div>
      <p className="border-t border-line p-3 text-xs text-text-dim">
        {t('vetting.dataWeRead.note')}
      </p>
    </Panel>
  );
}
