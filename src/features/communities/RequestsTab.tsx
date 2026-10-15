import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import {
  Button,
  DataTable,
  EmptyState,
  FilterChip,
  NativeSelect,
  Panel,
  SearchInput,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import { permissionsForEndpoints } from '@/esi/registry';
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
import { ComposeRequestDialog, type ComposePrefill } from './ComposeRequestDialog';
import type { CommunityMember } from './communityStore';
import { MyPledgesPanel } from './MyPledgesPanel';
import { PledgeBar } from './PledgeBar';
import { RequestPanel } from './RequestPanel';
import { STATUS_TONE, formatLeft, formatShortAge } from './requestFormat';
import { LOCATION_ENDPOINTS, useRequestDistance } from './useRequestDistance';
import { useSharedBlueprintTypes } from './useSharedBlueprintTypes';

/** The jump limits the distance select offers; "any" is no limit. */
const DISTANCE_CHOICES = [5, 10, 20] as const;
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

/**
 * The Requests tab body (scope decision `20261014-221403-community-requests-...`,
 * ADR 0021): a board of the Community's Requests with Open, Mine and I can fill
 * (a line for a blueprint this Member shares), a distance limit in jumps from
 * the pilot, a search box and the table; a row opens its side panel. Any
 * Member posts a Request from New request….
 *
 * A filter that cannot work says why instead of doing nothing: I can fill is
 * disabled when the shared blueprints could not be read, and the distance
 * select when the pilot's location is not known (no Permission, or ESI gave
 * none). Under a distance limit, Requests whose place cannot be measured (older
 * free text, a place off the stargate map) are left out and counted.
 */
export function RequestsTab({
  characterId,
  communityId,
  communityName,
  myUid,
  isAdmin,
  memberNames,
  requests,
  pledges,
  pledgesFailed,
  failed,
  now,
  members,
  initialCompose,
  onReload,
  refreshPledges,
}: {
  characterId: number;
  communityId: string;
  communityName: string;
  myUid: string;
  /** The viewer administers this Community: the side panel offers Remove request… and Remove… per Pledge. */
  isAdmin: boolean;
  /** Member uid to display name, to name each Pledger in the admin's panel. */
  memberNames: ReadonlyMap<string, string>;
  /** Null until the first read lands. */
  requests: CommunityRequest[] | null;
  /** The Pledges under each open Request, from the board's read. */
  pledges: PledgesByRequest;
  /** The Pledge read failed: the board's progress and statuses are not to be trusted. */
  pledgesFailed: boolean;
  failed: boolean;
  now: number;
  /** The roster, for compose step 2; null until it has loaded. */
  members: readonly CommunityMember[] | null;
  /** Open New request… on mount with this filled in (a Library "Request this" starts here). */
  initialCompose?: ComposePrefill;
  onReload: () => void;
  /** Re-reads one Request's Pledges after a Pledge write. */
  refreshPledges: (requestId: string) => Promise<RequestPledge[]>;
}) {
  const { t } = useTranslation();
  const distanceNoteId = useId();
  const [filter, setFilter] = useState<RequestFilter>('open');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(initialCompose !== undefined);
  const [pledgesOpen, setPledgesOpen] = useState(false);
  const [maxJumps, setMaxJumps] = useState<number | null>(null);
  const shared = useSharedBlueprintTypes(characterId, communityId, myUid, requests !== null);
  const sharedItems = shared.status === 'ready' ? shared.items : undefined;
  const distance = useRequestDistance(characterId, maxJumps !== null);
  // A limit that can no longer be measured (Permission revoked, location lost) is no limit:
  // the select then reads "Any distance", never a limit the list is not applying.
  const limit = distance.status === 'unavailable' ? null : maxJumps;

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
            {request.lines[0].name}
            {request.lines.length > 1
              ? ` ${t('communities.board.more', { count: request.lines.length - 1 })}`
              : ''}
          </span>
          <span className="block truncate text-text-dim">
            {[mine ? t('communities.board.you') : request.ownerName, request.location]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      ),
      sortValue: ({ request }) => request.lines[0].name.toLowerCase(),
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
      render: ({ progress, request }) => (
        <PledgeBar
          needed={request.lines.length}
          pledged={progress.pledgedLines}
          delivered={progress.deliveredLines}
          unit="lines"
        />
      ),
    },
    {
      id: 'status',
      header: t('communities.board.columns.status'),
      render: ({ status }) => <span className={STATUS_TONE[status]}>{statusLabels[status]}</span>,
      sortValue: ({ status }) => STATUS_ORDER[status],
    },
    {
      id: 'age',
      header: t('communities.board.columns.age'),
      align: 'right',
      className: 'whitespace-nowrap text-text-dim',
      render: ({ request }) =>
        `${formatShortAge(now - request.createdAt, t)} · ${formatLeft(request.expiresAt, now, t)}`,
      sortValue: ({ request }) => request.createdAt,
    },
  ];

  if (failed && requests === null) {
    return (
      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="min-w-0 flex-1 text-xs text-danger">
            {t('communities.board.loadFailed')}
          </p>
          <Button size="sm" onClick={onReload}>
            {t('communities.retry')}
          </Button>
        </div>
      </Panel>
    );
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
      myUid={myUid}
      members={members}
      prefill={initialCompose}
      onClose={() => setComposing(false)}
      onPosted={() => {
        setFilter('mine');
        setQuery('');
        onReload();
      }}
    />
  );
  const newRequest = (
    <Button size="sm" variant="primary" onClick={() => setComposing(true)}>
      {t('communities.board.new')}
    </Button>
  );

  if (requests.length === 0) {
    return (
      <>
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
  // A Pledge counts as in progress until everything it promised is delivered.
  const inProgress = myRows.filter((row) => row.entry.delivered < row.entry.quantity).length;
  const requestsPart = t('communities.board.summaryRequests', { count: myOpen });

  return (
    <div className="space-y-3">
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
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SearchInput
            className="min-w-48 flex-1"
            aria-label={t('communities.board.search')}
            placeholder={t('communities.board.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <FilterChip
            label={t('communities.board.filters.open')}
            selected={filter === 'open'}
            count={open.length}
            onToggle={() => setFilter('open')}
          />
          <FilterChip
            label={t('communities.board.filters.mine')}
            selected={filter === 'mine'}
            count={mineCount}
            onToggle={() => setFilter('mine')}
          />
          <FilterChip
            label={t('communities.board.filters.canFill')}
            selected={filter === 'canFill'}
            count={shared.status === 'ready' ? fillCount : undefined}
            tooltip={
              shared.status === 'failed'
                ? t('communities.board.canFillFailed')
                : t('communities.board.canFillHint')
            }
            disabled={shared.status === 'failed'}
            onToggle={() => setFilter('canFill')}
          />
          {/* A native select, as the mockup draws it: four fixed choices, where a phone gets the OS picker. */}
          <NativeSelect
            aria-label={t('communities.board.distance.label')}
            aria-describedby={distanceOff ? `${distanceNoteId}` : undefined}
            disabled={distanceOff}
            value={limit === null ? 'any' : String(limit)}
            onChange={(e) => setMaxJumps(e.target.value === 'any' ? null : Number(e.target.value))}
          >
            <option value="any">{t('communities.board.distance.any')}</option>
            {DISTANCE_CHOICES.map((jumps) => (
              <option key={jumps} value={jumps}>
                {t('communities.board.distance.within', { count: jumps })}
              </option>
            ))}
          </NativeSelect>
        </div>
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
          <p role="status" className="mb-3 text-xs text-text-dim">
            {t('communities.board.distance.unmeasured', { count: unmeasured })}
          </p>
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
            columns={columns}
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
          onRemoved={() => {
            setOpenId(null);
            onReload();
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
      {compose}
    </div>
  );
}
