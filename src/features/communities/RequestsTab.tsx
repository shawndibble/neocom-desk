import { useLiveQuery } from 'dexie-react-hooks';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import {
  LiveNote,
  Button,
  ColumnPickerMenu,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterField,
  Panel,
  SearchInput,
  Spinner,
  type ActiveFilter,
  type DataTableColumn,
  NeedsConnection,
  ToastStack,
  useDeferredCommits,
} from '@/components/ui';
import { db } from '@/db';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { permissionsForEndpoints } from '@/esi/registry';
import { uidForCharacter } from '@/sync/uid';
import type { Translate } from '@/lib/translate';
import {
  filterRequests,
  isOpenRequest,
  myPledgeRows,
  requestProgress,
  requestStatus,
  withinJumps,
  type CommunityRequest,
  type RequestFilter,
  type PledgesByRequest,
  type RequestPledge,
  type RequestStatus,
} from '@/engine/communities/requests';
import { jumpRangeLimit, type JumpRange } from '@/engine/route/jumpRange';
import { useCurrentSystem } from '@/features/route/currentSystem';
import { CurrentSystemPicker, JumpRangeSelect } from '@/features/route/JumpRangeControls';
import { ComposeRequestDialog } from './ComposeRequestDialog';
import {
  REQUEST_COLUMN_IDS,
  useVisibleRequestColumns,
  type RequestColumnId,
} from './requestColumns';
import { MyPledgesPanel } from './MyPledgesPanel';
import { PledgeBar } from './PledgeBar';
import { RequestPanel } from './RequestPanel';
import type { BuyerOption } from './BuybackFields';
import {
  STATUS_TONE,
  formatLeft,
  formatShortAge,
  requestHeadline,
  standingRateLine,
} from './requestFormat';
import { LOCATION_ENDPOINTS, useRequestDistance } from './useRequestDistance';
import { useSharedBlueprintTypes } from './useSharedBlueprintTypes';

const LOCATION_GROUPS = permissionsForEndpoints(LOCATION_ENDPOINTS);

interface Row {
  request: CommunityRequest;
  status: RequestStatus;
  progress: ReturnType<typeof requestProgress>;
  mine: boolean;
}

const STATUS_ORDER: Record<RequestStatus, number> = {
  open: 0,
  pledged: 1,
  partDelivered: 2,
  delivered: 3,
  closed: 4,
  expired: 5,
};

interface RequestFilterValue {
  filter: RequestFilter;
  jumps: JumpRange;
}

const REQUEST_FILTER_KEY: Record<RequestFilter, string> = {
  open: 'communities.board.filters.open',
  mine: 'communities.board.filters.mine',
  canFill: 'communities.board.filters.canFill',
};

function activeRequestFilters(
  { filter, jumps }: RequestFilterValue,
  t: Translate
): ActiveFilter<RequestFilterValue>[] {
  const active: ActiveFilter<RequestFilterValue>[] = [];
  if (filter !== 'open')
    active.push({
      label: t('communities.board.filters.show'),
      value: t(REQUEST_FILTER_KEY[filter]),
      clear: (value) => ({ ...value, filter: 'open' }),
    });
  if (jumps !== 'any')
    active.push({
      label: t('communities.board.distance.label'),
      value: t(`jumpRange.option.${jumps}`),
      clear: (value) => ({ ...value, jumps: 'any' }),
    });
  return active;
}

export function RequestsTab({
  initialRequestId,
  characterId,
  communityId,
  communityName,
  myUid,
  isAdmin,
  memberNames,
  requests: allRequests,
  pledges,
  pledgesFailed,
  failed,
  now,
  onReload,
  refreshPledges,
}: {
  initialRequestId?: string;
  characterId: number;
  communityId: string;
  communityName: string;
  myUid: string;
  isAdmin: boolean;
  memberNames: ReadonlyMap<string, string>;
  requests: CommunityRequest[] | null;
  pledges: PledgesByRequest;
  pledgesFailed: boolean;
  failed: boolean;
  now: number;
  onReload: () => void;
  refreshPledges: (requestId: string) => Promise<RequestPledge[]>;
}) {
  const { t } = useTranslation();
  const distanceNoteId = useId();
  const [filter, setFilter] = useState<RequestFilter>('open');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(initialRequestId ?? null);
  const pendingRemovals = useDeferredCommits();
  const { hiddenIds: hiddenRequestIds } = pendingRemovals;
  const requests = useMemo(
    () =>
      hiddenRequestIds.size === 0 || allRequests === null
        ? allRequests
        : allRequests.filter((r) => !hiddenRequestIds.has(r.id)),
    [allRequests, hiddenRequestIds]
  );
  const [seenRequestId, setSeenRequestId] = useState(initialRequestId);
  if (initialRequestId !== seenRequestId) {
    setSeenRequestId(initialRequestId);
    if (initialRequestId) setOpenId(initialRequestId);
  }
  const [composing, setComposing] = useState(false);
  const [pledgesOpen, setPledgesOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [jumps, setJumps] = useState<JumpRange>('any');
  const currentSystem = useCurrentSystem();
  const maxJumps = jumpRangeLimit(jumps);
  const localCharacters = useLiveQuery(() => db.characters.toArray(), []);
  const buyers = useMemo<BuyerOption[]>(
    () =>
      (localCharacters ?? [])
        .filter(
          (c) => c.characterId === characterId || memberNames.has(uidForCharacter(c.characterId))
        )
        .map((c) => ({ characterId: c.characterId, name: c.name })),
    [localCharacters, memberNames, characterId]
  );
  const shared = useSharedBlueprintTypes(characterId, communityId, myUid, requests !== null);
  const sharedItems = shared.status === 'ready' ? shared.items : undefined;
  const distance = useRequestDistance(characterId, currentSystem, maxJumps !== null);
  const limit = distance.status === 'unavailable' ? null : maxJumps;
  const shownJumps: JumpRange = limit === null ? 'any' : jumps;
  const filterValue: RequestFilterValue = { filter, jumps: shownJumps };

  const { rows, unmeasured } = useMemo(() => {
    const filtered = filterRequests(requests ?? [], { filter, query, myUid, now, sharedItems });
    const { within, unmeasured: left } =
      distance.status === 'ready'
        ? withinJumps(filtered, limit, (request) => distance.jumpsOf(request.location))
        : { within: filtered, unmeasured: 0 };
    return {
      unmeasured: left,
      rows: within.map((request): Row => {
        const forRequest = pledges.get(request.id) ?? [];
        return {
          request,
          status: requestStatus(request, forRequest, now),
          progress: requestProgress(request, forRequest),
          mine: request.ownerUid === myUid,
        };
      }),
    };
  }, [requests, pledges, filter, query, myUid, now, sharedItems, distance, limit]);

  const statusLabels: Record<RequestStatus, string> = {
    open: t('communities.board.status.open'),
    pledged: t('communities.board.status.pledged'),
    partDelivered: t('communities.board.status.partDelivered'),
    delivered: t('communities.board.status.delivered'),
    closed: t('communities.board.status.closed'),
    expired: t('communities.board.status.expired'),
  };

  const columns: DataTableColumn<Row>[] = [
    {
      id: 'request',
      header: t('communities.board.columns.request'),
      primary: true,
      render: ({ request, mine }) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-accent">
            {requestHeadline(request, t)}
          </span>
          <span className="block truncate text-text-dim">
            {[mine ? t('communities.board.you') : request.ownerName, request.location]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      ),
      sortValue: ({ request }) => requestHeadline(request, t).toLowerCase(),
    },
    {
      id: 'terms',
      header: t('communities.board.columns.terms'),
      render: ({ request }) =>
        request.terms ? <span className="text-text-dim">{request.terms}</span> : null,
    },
    {
      id: 'progress',
      header: t('communities.board.columns.progress'),
      className: 'whitespace-nowrap',
      render: ({ progress, request }) =>
        request.standing ? (
          <span className="tabular-nums">{standingRateLine(request.standing, t)}</span>
        ) : (
          <PledgeBar
            needed={request.lines.length}
            pledged={progress.pledgedLines}
            delivered={progress.deliveredLines}
            unit="lines"
          />
        ),
      sortValue: ({ progress, request }) =>
        request.standing || progress.lines === 0
          ? undefined
          : (progress.deliveredLines + progress.pledgedLines / (progress.lines + 1)) /
            progress.lines,
    },
    {
      id: 'status',
      header: t('communities.board.columns.status'),
      className: 'whitespace-nowrap',
      render: ({ status }) => <span className={STATUS_TONE[status]}>{statusLabels[status]}</span>,
      sortFirst: 'asc',
      sortValue: ({ status }) => STATUS_ORDER[status],
    },
    {
      id: 'age',
      header: t('communities.board.columns.age'),
      align: 'right',
      className: 'whitespace-nowrap text-text-dim',
      render: ({ request }) =>
        `${formatShortAge(now - request.createdAt, t)} · ${
          request.standing
            ? t('communities.board.buyback.standing')
            : formatLeft(request.expiresAt, now, t)
        }`,
      sortValue: ({ request }) => request.createdAt,
    },
  ];

  const { visible, isVisible, toggle, reset } = useColumnVisibility(
    useVisibleRequestColumns,
    REQUEST_COLUMN_IDS
  );
  const columnsById = Object.fromEntries(columns.map((column) => [column.id, column])) as Record<
    RequestColumnId,
    DataTableColumn<Row>
  >;
  const shownColumns = columns.filter(
    (column) => column.id === 'request' || isVisible(column.id as RequestColumnId)
  );

  const reloadFailed = (
    <div className="flex flex-wrap items-center gap-2">
      <p role="alert" className="min-w-0 flex-1 text-xs text-danger">
        {t('communities.board.loadFailed')}
      </p>
      <Button size="sm" onClick={onReload}>
        {t('communities.retry')}
      </Button>
    </div>
  );
  if (failed && requests === null) {
    return <Panel>{reloadFailed}</Panel>;
  }
  if (requests === null) {
    return (
      <Panel>
        <Spinner size="sm" label={t('communities.loading')} />
      </Panel>
    );
  }

  const compose = composing && (
    <ComposeRequestDialog
      characterId={characterId}
      communityId={communityId}
      buyers={buyers}
      onClose={() => setComposing(false)}
      onPosted={() => {
        setFilter('mine');
        setQuery('');
        onReload();
      }}
    />
  );
  const editing = editingId !== null ? (requests.find((r) => r.id === editingId) ?? null) : null;
  const edit = editing && (
    <ComposeRequestDialog
      characterId={characterId}
      communityId={communityId}
      buyers={buyers}
      editing={{
        request: editing,
        linesLocked: !editing.standing && (pledges.get(editing.id) ?? []).length > 0,
      }}
      onClose={() => setEditingId(null)}
      onPosted={onReload}
    />
  );
  const newRequest = (
    <NeedsConnection>
      <Button size="sm" variant="primary" onClick={() => setComposing(true)}>
        {t('communities.board.new')}
      </Button>
    </NeedsConnection>
  );

  if (allRequests?.length === 0) {
    return (
      <>
        {failed && <Panel>{reloadFailed}</Panel>}
        <Panel>
          <EmptyState
            title={t('communities.board.empty')}
            hint={t('communities.board.emptyHint')}
            action={newRequest}
          />
        </Panel>
        {compose}
      </>
    );
  }

  const open = requests.filter((r) => isOpenRequest(r, now));
  const mineCount = requests.filter((r) => r.ownerUid === myUid).length;
  const myOpen = open.filter((r) => r.ownerUid === myUid).length;
  const fillCount = filterRequests(requests, {
    filter: 'canFill',
    query: '',
    myUid,
    now,
    sharedItems,
  }).length;
  const panelRequest = requests.find((r) => r.id === openId) ?? null;
  const distanceOff = distance.status === 'unavailable';
  const measuring = limit !== null && distance.status === 'loading';
  const myRows = myPledgeRows(requests, pledges, myUid, now);
  const inProgress = myRows.filter((row) => row.entry.delivered < row.entry.quantity).length;
  const requestsPart = t('communities.board.summaryRequests', { count: myOpen });

  return (
    <div className="space-y-3">
      {failed && <Panel>{reloadFailed}</Panel>}
      <div className="flex flex-wrap items-center gap-2 rounded-xs border border-line px-3 py-2">
        <p className="min-w-0 basis-full text-xs text-text-dim sm:basis-0 sm:flex-1">
          {inProgress > 0
            ? t('communities.board.summaryBoth', {
                requests: requestsPart,
                pledges: t('communities.board.summaryPledges', { count: inProgress }),
              })
            : t('communities.board.summary', { count: myOpen })}
        </p>
        <Button
          size="sm"
          aria-haspopup="dialog"
          aria-expanded={pledgesOpen}
          onClick={() => setPledgesOpen(true)}
        >
          {t('communities.board.myPledges.open')}
        </Button>
        {newRequest}
      </div>
      {pledgesFailed && (
        <div className="flex flex-wrap items-center gap-2 rounded-xs border border-line px-3 py-2">
          <p role="alert" className="min-w-0 flex-1 text-xs text-danger">
            {t('communities.board.pledgesBoardFailed')}
          </p>
          <Button size="sm" onClick={onReload}>
            {t('communities.retry')}
          </Button>
        </div>
      )}
      <Panel>
        <FilterBar
          className="mb-3"
          value={filterValue}
          onChange={(next) => {
            setFilter(next.filter);
            setJumps(next.jumps);
          }}
          active={activeRequestFilters(filterValue, t)}
          resultCount={rows.length}
          actions={
            <ColumnPickerMenu
              available={REQUEST_COLUMN_IDS}
              visible={visible}
              columnsById={columnsById}
              onToggle={toggle}
              onReset={reset}
              buttonLabel={t('common.columnsButton')}
              menuTitle={t('common.columnsMenuTitle')}
              resetLabel={t('common.resetColumns')}
            />
          }
          search={
            <SearchInput
              className="min-w-48 flex-1"
              aria-label={t('communities.board.search')}
              placeholder={t('communities.board.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          }
        >
          {(draft, setDraft) => (
            <>
              <FilterField label={t('communities.board.filters.show')}>
                <div className="flex flex-wrap items-center gap-2">
                  <FilterChip
                    size="md"
                    label={t('communities.board.filters.open')}
                    selected={draft.filter === 'open'}
                    count={open.length}
                    onToggle={() => setDraft({ ...draft, filter: 'open' })}
                  />
                  <FilterChip
                    size="md"
                    label={t('communities.board.filters.mine')}
                    selected={draft.filter === 'mine'}
                    count={mineCount}
                    onToggle={() => setDraft({ ...draft, filter: 'mine' })}
                  />
                  <FilterChip
                    size="md"
                    label={t('communities.board.filters.canFill')}
                    selected={draft.filter === 'canFill'}
                    count={shared.status === 'ready' ? fillCount : undefined}
                    tooltip={
                      shared.status === 'failed'
                        ? t('communities.board.canFillFailed')
                        : t('communities.board.canFillHint')
                    }
                    disabled={shared.status === 'failed'}
                    onToggle={() => setDraft({ ...draft, filter: 'canFill' })}
                  />
                </div>
              </FilterField>
              <FilterField label={t('communities.board.distance.label')}>
                <div className="flex flex-wrap items-center gap-2">
                  <JumpRangeSelect
                    value={draft.jumps}
                    active={draft.jumps !== 'any'}
                    onChange={(next) => setDraft({ ...draft, jumps: next })}
                  />
                  <CurrentSystemPicker current={currentSystem} />
                </div>
              </FilterField>
            </>
          )}
        </FilterBar>
        {distanceOff && (
          <p id={distanceNoteId} className="mb-3 text-xs text-text-dim">
            {distance.reason === 'permission' ? (
              <>
                {t('communities.board.distance.needPermission')}{' '}
                <GrantMissingLink groups={LOCATION_GROUPS} />
              </>
            ) : (
              t('communities.board.distance.noLocation')
            )}
          </p>
        )}
        {distance.status === 'failed' && limit !== null && (
          <p role="alert" className="mb-3 text-xs text-danger">
            {t('communities.board.distance.failed')}
          </p>
        )}
        {distance.status === 'ready' && limit !== null && unmeasured > 0 && (
          <LiveNote className="mb-3 text-xs text-text-dim">
            {t('communities.board.distance.unmeasured', { count: unmeasured })}
          </LiveNote>
        )}
        {measuring ? (
          <Spinner size="sm" label={t('communities.board.distance.measuring')} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={
              query.trim()
                ? t('communities.board.noMatch')
                : distance.status === 'ready' && limit !== null
                  ? t('communities.board.distance.none', { count: limit })
                  : filter === 'mine'
                    ? t('communities.board.noneMine')
                    : filter === 'canFill'
                      ? t('communities.board.noneCanFill')
                      : t('communities.board.noneOpen')
            }
          />
        ) : (
          <DataTable
            label={t('communities.board.tableLabel')}
            rows={rows}
            rowKey={(row) => row.request.id}
            columns={shownColumns}
            selectedRowKey={openId}
            onRowClick={(row) => setOpenId(row.request.id)}
            stackLayout="dense"
          />
        )}
      </Panel>
      {panelRequest && (
        <RequestPanel
          request={panelRequest}
          mine={panelRequest.ownerUid === myUid}
          myUid={myUid}
          pledges={pledges.get(panelRequest.id) ?? []}
          now={now}
          characterId={characterId}
          communityId={communityId}
          communityName={communityName}
          isAdmin={isAdmin}
          memberNames={memberNames}
          onClose={() => setOpenId(null)}
          onChanged={onReload}
          onEdit={() => setEditingId(panelRequest.id)}
          onRemove={({ message, commit }) => {
            pendingRemovals.defer({
              id: panelRequest.id,
              message,
              commit: async () => {
                await commit();
                onReload();
              },
            });
            setOpenId(null);
          }}
          refreshPledges={refreshPledges}
        />
      )}
      <MyPledgesPanel
        open={pledgesOpen}
        rows={myRows}
        communityName={communityName}
        onClose={() => setPledgesOpen(false)}
        onOpenRequest={(id) => {
          setPledgesOpen(false);
          setOpenId(id);
        }}
      />
      <ToastStack
        items={pendingRemovals.items}
        undoLabel={t('communities.board.admin.undo')}
        onUndo={pendingRemovals.undo}
        onClose={pendingRemovals.commit}
      />
      {compose}
      {edit}
    </div>
  );
}
