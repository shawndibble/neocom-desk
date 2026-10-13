import { useTranslation } from 'react-i18next';
import { DataTable, EmptyState, type DataTableColumn } from '@/components/ui';
import type { SharedBlueprintRow } from './sharedBlueprintCopies';

/**
 * The Community Library's "Shared in the Community" view: each shared
 * blueprint with who shares it, where it is (station or structure, and
 * system), ME / TE and runs (BPO, or the runs a BPC has left). A stale
 * Member's rows are greyed, never hidden. Read-only: no row click, no menu.
 */
export function SharedBlueprintTable({ rows }: { rows: readonly SharedBlueprintRow[] }) {
  const { t } = useTranslation();
  if (rows.length === 0) return <EmptyState title={t('communities.library.none')} />;
  const columns: DataTableColumn<SharedBlueprintRow>[] = [
    {
      id: 'name',
      header: t('communities.library.columns.blueprint'),
      primary: true,
      render: (row) => row.name,
      sortValue: (row) => row.name,
    },
    {
      id: 'member',
      header: t('communities.library.columns.member'),
      render: (row) => (
        <>
          {row.memberName}
          {row.stale && (
            <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 text-[0.6875rem] text-text-dim">
              {t('communities.staleBadge')}
            </span>
          )}
        </>
      ),
      sortValue: (row) => row.memberName,
    },
    {
      id: 'location',
      header: t('communities.library.columns.location'),
      render: (row) => (
        <>
          {row.locationName}
          <span className="block text-text-dim">{row.systemName}</span>
        </>
      ),
      sortValue: (row) => `${row.systemName} ${row.locationName}`,
    },
    {
      id: 'meTe',
      header: t('communities.library.columns.meTe'),
      align: 'right',
      render: (row) => `${row.me} / ${row.te}`,
      sortValue: (row) => row.me * 100 + row.te,
    },
    {
      id: 'runs',
      header: t('communities.library.columns.runs'),
      align: 'right',
      render: (row) =>
        row.runs < 0
          ? t('communities.library.bpo')
          : t('communities.library.runs', { count: row.runs }),
      sortValue: (row) => (row.runs < 0 ? Number.MAX_SAFE_INTEGER : row.runs),
    },
  ];
  return (
    <DataTable
      label={t('communities.library.sharedLabel')}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.key}
      rowClassName={(row) => (row.stale ? 'opacity-60' : undefined)}
      defaultSort={{ columnId: 'name', direction: 'asc' }}
      virtualize="auto"
    />
  );
}
