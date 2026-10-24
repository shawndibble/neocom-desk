/**
 * The Roles tab of `/corp/members` (issue #4613): who holds a sensitive role, and
 * what changed lately. The game client has no audit view of this.
 *
 * Mounted only while the tab is open and only for a Director whose grant holds
 * `read_titles`, so it reads on its own and never touches the roster read: the
 * roster baseline (`rosterState`) is recorded by the Members tab alone.
 *
 * Only sensitive roles (`engine/corp/roleAudit.ts`) are shown; there is no "all
 * roles" toggle. History is what ESI keeps, about a month, so the last
 * `HISTORY_DAYS` days show and anything older waits behind "Show older".
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  CachedNotice,
  DataAgeBadge,
  DataTable,
  EmptyState,
  IconButton,
  PageHeader,
  Panel,
  Spinner,
  TabPanel,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { Pill } from '@/components/ui/Pill';
import { DataGate } from '@/components/DataGate';
import { CharacterLink } from '@/features/entities';
import { label } from '@/engine/corp/members';
import { recentChanges, roleLabel, type RoleChange } from '@/engine/corp/roleAudit';
import { formatAge } from '@/lib/age';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';

import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { loadCorporationId } from './boardData';
import { loadRoleAudit, type RoleAuditData } from './roleAudit';

/** Days of history shown before "Show older". */
const HISTORY_DAYS = 30;

interface RoleAuditSnapshot {
  audit: RoleAuditData | null;
  needsReauth: boolean;
  loadedAt: number;
}

const EMPTY: RoleAuditSnapshot = { audit: null, needsReauth: false, loadedAt: 0 };

async function loadSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<RoleAuditSnapshot> {
  const corporationId = await loadCorporationId(characterId);
  const loadedAt = Date.now();
  if (corporationId === null || signal.cancelled) return { ...EMPTY, loadedAt };
  const result = await loadRoleAudit(characterId, corporationId, { withTitles: true });
  if ('needsReauth' in result) return { ...EMPTY, needsReauth: true, loadedAt };
  return { audit: result.data, needsReauth: false, loadedAt };
}

interface HolderRow {
  characterId: number;
  name: string | null;
  roles: string;
  isDirector: boolean;
  isCeo: boolean;
  titles: string;
  lastChangeMs: number | null;
}

interface HistoryRow {
  key: string;
  change: RoleChange;
  member: string | null;
  issuer: string | null;
}

const DASH = '—';

function HistoryTable({ rows }: { rows: readonly HistoryRow[] }) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const columns = useMemo<DataTableColumn<HistoryRow>[]>(
    () => [
      {
        id: 'when',
        header: t('corp.roles.columnWhen'),
        className: 'whitespace-nowrap tabular-nums text-text-dim',
        render: (row) => (
          <time dateTime={new Date(row.change.changedAtMs).toISOString()}>
            {formatTimestamp(new Date(row.change.changedAtMs), timeZone)}
          </time>
        ),
        sortValue: (row) => row.change.changedAtMs,
      },
      {
        id: 'member',
        header: t('corp.roles.columnMember'),
        primary: true,
        className: 'truncate',
        render: (row) => (
          <CharacterLink id={row.change.characterId}>
            {label(row.member, row.change.characterId)}
          </CharacterLink>
        ),
        sortValue: (row) => row.member ?? undefined,
      },
      {
        id: 'change',
        header: t('corp.roles.columnChange'),
        render: (row) =>
          [
            row.change.granted.length > 0
              ? t('corp.roles.granted', { roles: row.change.granted.map(roleLabel).join(', ') })
              : null,
            row.change.removed.length > 0
              ? t('corp.roles.removed', { roles: row.change.removed.map(roleLabel).join(', ') })
              : null,
          ]
            .filter(Boolean)
            .join(' · '),
      },
      {
        id: 'issuer',
        header: t('corp.roles.columnIssuer'),
        className: 'truncate',
        render: (row) => (
          <CharacterLink id={row.change.issuerId}>
            {label(row.issuer, row.change.issuerId)}
          </CharacterLink>
        ),
        sortValue: (row) => row.issuer ?? undefined,
      },
    ],
    [t, timeZone]
  );
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.key}
      label={t('corp.roles.historyLabel')}
      density="compact"
    />
  );
}

/** The page's tab bar, and the ids its panel is linked by. */
export interface MembersTabsSlot {
  bar: ReactNode;
  tabsId: string;
  tabId: string;
}

/** The tab's content region (a11y: `role="tabpanel"` named by its tab); a bare fragment with no tabs. */
export function MembersTabPanel({
  slot,
  children,
}: {
  slot: MembersTabsSlot | null;
  children: ReactNode;
}) {
  if (slot === null) return <>{children}</>;
  return (
    <TabPanel tabsId={slot.tabsId} tabId={slot.tabId}>
      {children}
    </TabPanel>
  );
}

/** The Roles tab. `tabs` is the page's tab bar, drawn under the header like the Members tab's. */
export function CorpRoleAudit({ tabs }: { tabs: MembersTabsSlot }) {
  const { t } = useTranslation();
  const snapshot = useRouteSnapshot<RoleAuditSnapshot>(loadSnapshot, undefined, {
    staleWhileRevalidate: true,
    cacheKey: 'corp-role-audit',
  });
  const [showOlder, setShowOlder] = useState(false);
  const data = snapshot.data;
  const audit = data?.audit ?? null;

  const holders = useMemo<HolderRow[]>(() => {
    if (audit === null) return [];
    const lastChange = new Map<number, number>();
    for (const change of audit.changes ?? []) {
      if (!lastChange.has(change.characterId))
        lastChange.set(change.characterId, change.changedAtMs);
    }
    return audit.holders
      .map((holder) => ({
        characterId: holder.characterId,
        name: audit.names.get(holder.characterId) ?? null,
        roles: holder.roles.map(roleLabel).join(', '),
        isDirector: holder.roles.includes('Director'),
        isCeo: holder.characterId === audit.ceoId,
        titles: holder.titles.join(', '),
        lastChangeMs: lastChange.get(holder.characterId) ?? null,
      }))
      .sort(
        (a, b) =>
          Number(b.isDirector) - Number(a.isDirector) ||
          label(a.name, a.characterId).localeCompare(label(b.name, b.characterId)) ||
          a.characterId - b.characterId
      );
  }, [audit]);

  const loadedAt = data?.loadedAt ?? 0;
  const history = useMemo(() => {
    if (audit === null || audit.changes === null) return { recent: [], older: [] };
    const toRow = (change: RoleChange): HistoryRow => ({
      key: `${change.characterId}:${change.changedAtMs}:${change.granted.join()}:${change.removed.join()}`,
      change,
      member: audit.names.get(change.characterId) ?? null,
      issuer: audit.names.get(change.issuerId) ?? null,
    });
    const recent = recentChanges(audit.changes, loadedAt, HISTORY_DAYS);
    const recentSet = new Set(recent);
    return {
      recent: recent.map(toRow),
      older: audit.changes.filter((change) => !recentSet.has(change)).map(toRow),
    };
  }, [audit, loadedAt]);

  const columns = useMemo<DataTableColumn<HolderRow>[]>(() => {
    const list: DataTableColumn<HolderRow>[] = [
      {
        id: 'member',
        header: t('corp.roles.columnMember'),
        primary: true,
        className: 'truncate',
        render: (row) => (
          <span className="flex min-w-0 items-center gap-1.5">
            <CharacterLink id={row.characterId} className="truncate">
              {label(row.name, row.characterId)}
            </CharacterLink>
            {row.isCeo && <Pill className="shrink-0">{t('corp.members.ceo')}</Pill>}
          </span>
        ),
        sortValue: (row) => row.name ?? undefined,
      },
      {
        id: 'roles',
        header: t('corp.roles.columnRoles'),
        render: (row) => row.roles,
        sortValue: (row) => row.roles,
      },
    ];
    if (audit?.titlesKnown) {
      list.push({
        id: 'titles',
        header: t('corp.roles.columnTitles'),
        className: 'truncate',
        render: (row) => row.titles || DASH,
        sortValue: (row) => row.titles || undefined,
      });
    }
    list.push({
      id: 'lastChange',
      header: t('corp.roles.columnLastChange'),
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) =>
        row.lastChangeMs === null ? DASH : formatAge(Math.max(0, loadedAt - row.lastChangeMs), t),
      sortValue: (row) => row.lastChangeMs ?? undefined,
    });
    return list;
  }, [t, audit?.titlesKnown, loadedAt]);

  if (!snapshot.hydrated) return <Spinner />;

  const loadFailed = data === null || audit === null;
  const directors = holders.filter((holder) => holder.isDirector).length;
  const shownHistory = showOlder ? [...history.recent, ...history.older] : history.recent;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('corp.members.title')}
        meta={
          audit?.fetchedAt ? (
            <DataAgeBadge date={audit.fetchedAt} note={t('corp.dataAgeNote')} />
          ) : undefined
        }
        actions={
          <IconButton
            icon={<Icon.Refresh />}
            label={t('corp.roles.refresh')}
            onClick={snapshot.refresh}
            disabled={snapshot.loading}
          />
        }
      />
      {tabs.bar}
      <MembersTabPanel slot={tabs}>
        <DataGate
          status={snapshot.loading && data === null ? 'busy' : loadFailed ? 'failed' : 'ok'}
          title={t('common.couldntLoad')}
          hint={data?.needsReauth ? t('corp.roles.needsGrantHint') : t('corp.roles.loadFailedHint')}
          onRetry={snapshot.refresh}
          resetKey={snapshot.activeCharacterId}
          busy={<Spinner />}
        >
          <div className="space-y-4">
            {audit?.fromCache && (
              <CachedNotice fetchedAt={audit.fetchedAt} refreshFailed={snapshot.refreshCount > 0} />
            )}
            <Panel padded={false}>
              <h2 className="px-3 pt-3 text-sm font-medium text-text">
                {t('corp.roles.holdersHeading')}
              </h2>
              <p className="px-3 pb-2 text-xs text-text-dim">
                {t('corp.roles.holdersSummary', {
                  count: directors,
                  directors,
                  holders: holders.length,
                })}
              </p>
              {holders.length === 0 ? (
                <EmptyState
                  title={t('corp.roles.holdersEmpty')}
                  hint={t('corp.roles.holdersEmptyHint')}
                  className="py-8"
                />
              ) : (
                <DataTable
                  columns={columns}
                  rows={holders}
                  rowKey={(row) => row.characterId}
                  label={t('corp.roles.tableLabel')}
                  density="compact"
                />
              )}
            </Panel>
            <Panel padded={false}>
              <h2 className="px-3 pt-3 text-sm font-medium text-text">
                {t('corp.roles.historyHeading')}
              </h2>
              <p className="px-3 pb-2 text-xs text-text-dim">
                {t('corp.roles.historyHint', { days: HISTORY_DAYS })}
              </p>
              {audit?.changes === null ? (
                <EmptyState
                  title={t('corp.roles.historyUnavailable')}
                  hint={t('corp.roles.historyUnavailableHint')}
                  className="py-8"
                />
              ) : shownHistory.length === 0 ? (
                <EmptyState
                  title={t('corp.roles.historyEmpty', { days: HISTORY_DAYS })}
                  hint={t('corp.roles.historyEmptyHint')}
                  className="py-8"
                />
              ) : (
                <HistoryTable rows={shownHistory} />
              )}
              {!showOlder && history.older.length > 0 && (
                <div className="p-3">
                  <Button size="sm" onClick={() => setShowOlder(true)}>
                    {t('corp.roles.showOlder', { count: history.older.length })}
                  </Button>
                </div>
              )}
            </Panel>
          </div>
        </DataGate>
      </MembersTabPanel>
    </div>
  );
}
