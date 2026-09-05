import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import {
  DataAgeBadge,
  DataTable,
  EmptyState,
  IconButton,
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
import { CharacterHeader } from '@/features/character/CharacterHeader';
import { loadCharacterSpSummary } from '@/features/character/characterSp';
import { getLastKnownSpSummary, type CharacterSpSummary } from '@/stores/characterSp';
import { OverviewSubNav } from '@/features/character/OverviewSubNav';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatDuration } from '@/lib/duration';

interface Snapshot {
  historyResult: CachedResult<CorporationHistoryEntry[]> | null;
  corpNames: Map<number, string>;
  /** Total/unallocated SP for the shared Character-overview header. */
  sp: CharacterSpSummary;
  /** Captured in the loader, not at render: `Date.now()` is impure and React forbids it in render/useMemo. */
  loadedAt: number;
}

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();

async function loadEmploymentHistorySnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  // The SP pair the shared header shows. Skips its ESI read entirely without
  // the /skills grant (characterSp.ts), so this route stays as public as its
  // corporation history is.
  const [historyResult, sp] = await Promise.all([
    loadEmploymentHistory(characterId),
    loadCharacterSpSummary(characterId, Date.now()),
  ]);
  const loadedAt = Date.now();
  // Already superseded: skip the name lookup, its result would be discarded.
  const corporationIds = signal.cancelled
    ? []
    : (historyResult?.data ?? []).map((entry) => entry.corporation_id);
  const corpNames = await resolveNames(corporationIds);
  return { historyResult, corpNames, sp, loadedAt };
}

/** Employment History: a character's corporation history. Public endpoint, no scope, no re-auth. */
export function EmploymentHistory() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadEmploymentHistorySnapshot
  );
  const character = useLiveQuery(
    () => (activeCharacterId === null ? undefined : db.characters.get(activeCharacterId)),
    [activeCharacterId]
  );

  const historyResult = data?.historyResult ?? null;
  const corpNames = data?.corpNames ?? NO_NAMES;
  // See Clones.tsx: falls back to another tab's already-loaded SP rather
  // than blanking the shared header while this tab's own read is in flight.
  const sp = data?.sp ?? getLastKnownSpSummary(activeCharacterId);

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
        render: (row) => {
          const name = corpNames.get(row.corporationId) ?? `#${row.corporationId}`;
          // Only the row that is both ongoing and matches the character's
          // current corp gets the badge — past corps and an ongoing row the
          // character record hasn't caught up to yet stay plain text. Never
          // a link to /corp: this route needs no scope and a typical viewer
          // has no Corp Access grant, so it would just land them on a
          // rejection.
          if (!row.ongoing || character?.corporationId !== row.corporationId) return name;
          return (
            <span className="inline-flex items-center gap-2">
              {name}
              <span className="rounded-xs border border-success/50 bg-success/15 px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-widest text-success uppercase">
                {t('employmentHistory.current')}
              </span>
            </span>
          );
        },
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
    [t, corpNames, character?.corporationId]
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
      <CharacterHeader
        characterId={activeCharacterId}
        totalSp={sp.totalSp}
        unallocatedSp={sp.unallocatedSp}
      />
      <OverviewSubNav />

      {/*
        Data age and Refresh sit on the panel's own toolbar, not up beside the
        character's name: above the tabs is the block every tab shares, and
        these describe this tab's data. The panel wraps every branch so that
        toolbar is present in the empty and failed states too — those are the
        ones a Refresh is for.
      */}
      <Panel
        title={t('employmentHistory.title')}
        actions={
          <span className="flex items-center gap-2">
            {historyResult && <DataAgeBadge date={historyResult.fetchedAt} />}
            <IconButton
              size="sm"
              icon={<Icon.Refresh />}
              label={t('employmentHistory.refresh')}
              onClick={refresh}
              disabled={loading}
            />
          </span>
        }
        padded={false}
      >
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
          <>
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
              rowClassName={(row) => (row.ongoing ? 'bg-success/5' : undefined)}
            />
          </>
        )}
      </Panel>
    </div>
  );
}
