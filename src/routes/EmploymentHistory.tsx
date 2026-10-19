import { NO_NAMES } from '@/lib/emptyCollections';
import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import {
  DataAgeBadge,
  EmptyState,
  IconButton,
  Panel,
  Spinner,
  CachedNotice,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  deriveEmploymentHistoryRows,
  deriveEmploymentSummary,
  loadEmploymentHistory,
} from '@/features/character/employmentHistory';
import {
  EmploymentSummaryChips,
  EmploymentTimeline,
} from '@/features/character/EmploymentTimeline';
import type { CachedResult } from '@/esi/cache';
import type { CorporationHistoryEntry } from '@/esi/endpoints';
import { resolveNames } from '@/features/character/names';
import { CharacterHeader } from '@/features/character/CharacterHeader';
import { OverviewSubNav } from '@/features/character/OverviewSubNav';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { employmentHistoryCsvColumns } from '@/features/character/employmentHistoryCsv';

interface Snapshot {
  historyResult: CachedResult<CorporationHistoryEntry[]> | null;
  corpNames: Map<number, string>;
  /** Captured in the loader, not at render: `Date.now()` is impure and React forbids it in render/useMemo. */
  loadedAt: number;
}

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */

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
    loadEmploymentHistorySnapshot,
    undefined,
    { cacheKey: 'employment-history' }
  );
  const character = useLiveQuery(
    () => (activeCharacterId === null ? undefined : db.characters.get(activeCharacterId)),
    [activeCharacterId]
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

  const summary = useMemo(() => deriveEmploymentSummary(rows, loadedAt), [rows, loadedAt]);

  const csvColumns = useMemo(() => employmentHistoryCsvColumns(t, corpNames), [t, corpNames]);
  const historyExport = useTableExport({
    surface: 'employment-history',
    source: 'rows',
    rows,
    columns: csvColumns,
  });

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
      {/*
        The header carries this tab's Refresh and export (level with the bell, at
        the bell's size), as the Overview's does; its data age sits on the tab row. They stay here in
        the empty and failed states too: those are the ones a Refresh is for. No SP: this tab has no use for it.
      */}
      <CharacterHeader
        characterId={activeCharacterId}
        actions={
          <div className="flex items-center gap-2">
            <IconButton
              icon={<Icon.Refresh />}
              label={t('employmentHistory.refresh')}
              onClick={refresh}
              busy={loading}
            />
            <TableActionsMenu
              name={t('employmentHistory.title')}
              tableExport={historyExport}
              size="md"
            />
          </div>
        }
      />
      <OverviewSubNav
        trailing={
          historyResult && (
            <span className="flex items-center gap-1 text-[0.6875rem] text-text-dim">
              {t('employmentHistory.updated')}
              <DataAgeBadge date={historyResult.fetchedAt} alwaysVisible />
            </span>
          )
        }
      />

      <Panel padded={false}>
        {loading && !data ? (
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
          <>
            {historyResult.fromCache && (
              <CachedNotice className="px-3 pt-2" fetchedAt={historyResult.fetchedAt} />
            )}
            <div className="space-y-4 p-3">
              <EmploymentSummaryChips summary={summary} names={corpNames} />
              <EmploymentTimeline
                rows={rows}
                names={corpNames}
                label={t('employmentHistory.title')}
                currentCorporationId={character?.corporationId}
              />
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
