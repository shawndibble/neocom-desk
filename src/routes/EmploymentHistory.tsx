import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  DataTable,
  EmptyState,
  IconButton,
  PageHeader,
  Panel,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  deriveEmploymentHistoryRows,
  loadEmploymentHistory,
  type EmploymentHistoryRow,
} from '@/features/character/employmentHistory';
import type { CachedResult } from '@/esi/cache';
import type { CorporationHistoryEntry } from '@/esi/endpoints';
import { resolveNames } from '@/features/character/names';
import { OverviewSubNav } from '@/features/character/OverviewSubNav';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatDuration } from '@/lib/duration';

interface Snapshot {
  historyResult: CachedResult<CorporationHistoryEntry[]> | null;
  corpNames: Map<number, string>;
  /** Captured in the loader, not at render: `Date.now()` is impure and React forbids it in render/useMemo. */
  loadedAt: number;
}

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();

async function loadEmploymentHistorySnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const historyResult = await loadEmploymentHistory(characterId);
  const loadedAt = Date.now();
  // Already superseded: skip the name lookup, its result would be discarded.
  const corporationIds = signal.cancelled
    ? []
    : (historyResult?.data ?? []).map((entry) => entry.corporation_id);
  const corpNames = await resolveNames(corporationIds);
  return { historyResult, corpNames, loadedAt };
}

/** Employment History: a character's corporation history. Public endpoint, no scope, no re-auth. */
export function EmploymentHistory() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadEmploymentHistorySnapshot
  );

  const historyResult = data?.historyResult ?? null;
  const corpNames = data?.corpNames ?? NO_NAMES;

  // Falls back to 0 when nothing has loaded yet: `historyResult` is null then too,
  // so `deriveEmploymentHistoryRows` receives no entries and the value is unused.
  const loadedAt = data?.loadedAt ?? 0;
  const rows = useMemo(
    () => deriveEmploymentHistoryRows(historyResult?.data ?? [], loadedAt),
    [historyResult, loadedAt]
  );

  const columns = useMemo<DataTableColumn<EmploymentHistoryRow>[]>(
    () => [
      {
        id: 'corporation',
        header: t('employmentHistory.corporation'),
        render: (row) => corpNames.get(row.corporationId) ?? `#${row.corporationId}`,
      },
      {
        id: 'started',
        header: t('employmentHistory.started'),
        className: 'whitespace-nowrap text-text-dim',
        render: (row) => new Date(row.startDate).toLocaleDateString(),
      },
      {
        id: 'duration',
        header: t('employmentHistory.duration'),
        align: 'right',
        className: 'tabular-nums',
        render: (row) => formatDuration(row.tenureSeconds),
      },
    ],
    [t, corpNames]
  );

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <OverviewSubNav />
      <PageHeader
        title={t('employmentHistory.title')}
        meta={historyResult && <DataAgeBadge date={historyResult.fetchedAt} />}
        actions={
          <>
            <IconButton
              icon={<Icon.Refresh />}
              label={t('employmentHistory.refresh')}
              onClick={refresh}
              disabled={loading}
            />
          </>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : !historyResult || rows.length === 0 ? (
        <EmptyState
          title={t('employmentHistory.emptyTitle')}
          hint={t('employmentHistory.emptyHint')}
        />
      ) : (
        <Panel padded={false}>
          {historyResult.fromCache && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t('common.offlineTitle')}
            </p>
          )}
          <DataTable
            label={t('employmentHistory.title')}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.recordId}
          />
        </Panel>
      )}
    </div>
  );
}
