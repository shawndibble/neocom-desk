import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  EmptyState,
  FilterChip,
  Panel,
  SearchInput,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import {
  filterRequests,
  isOpenRequest,
  requestProgress,
  requestStatus,
  type CommunityRequest,
  type RequestFilter,
  type RequestPledge,
  type RequestStatus,
} from '@/engine/communities/requests';
import { ComposeRequestDialog } from './ComposeRequestDialog';
import { PledgeBar } from './PledgeBar';
import { RequestPanel } from './RequestPanel';
import { STATUS_TONE, formatLeft, formatShortAge } from './requestFormat';

/**
 * Pledges per Request id. Empty until Pledges exist (issue #3808): the board
 * already derives progress and status from them, so that ticket only has to
 * load them and pass them in.
 */
const NO_PLEDGES: ReadonlyMap<string, readonly RequestPledge[]> = new Map();

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
 * ADR 0021): a board of the Community's Requests with Open and Mine, a search
 * box and the table; a row opens its side panel. Any Member posts a Request
 * from New request…. Which Requests fit this Member's blueprints and how near
 * they are come in later tickets.
 */
export function RequestsTab({
  characterId,
  communityId,
  myUid,
  requests,
  failed,
  now,
  onReload,
}: {
  characterId: number;
  communityId: string;
  myUid: string;
  /** Null until the first read lands. */
  requests: CommunityRequest[] | null;
  failed: boolean;
  now: number;
  onReload: () => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<RequestFilter>('open');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const rows = useMemo<Row[]>(
    () =>
      filterRequests(requests ?? [], { filter, query, myUid, now }).map((request) => {
        const pledges = NO_PLEDGES.get(request.id) ?? [];
        return {
          request,
          status: requestStatus(request, pledges, now),
          progress: requestProgress(request, pledges),
          mine: request.ownerUid === myUid,
        };
      }),
    [requests, filter, query, myUid, now]
  );

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
      onClose={() => setComposing(false)}
      onPosted={() => {
        setComposing(false);
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
  const panelRequest = requests.find((r) => r.id === openId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xs border border-line px-3 py-2">
        <p className="min-w-0 basis-full text-xs text-text-dim sm:basis-0 sm:flex-1">
          {t('communities.board.summary', { count: myOpen })}
        </p>
        {newRequest}
      </div>
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
        </div>
        {rows.length === 0 ? (
          <EmptyState
            title={
              query.trim()
                ? t('communities.board.noMatch')
                : filter === 'mine'
                  ? t('communities.board.noneMine')
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
          pledges={NO_PLEDGES.get(panelRequest.id) ?? []}
          now={now}
          characterId={characterId}
          communityId={communityId}
          onClose={() => setOpenId(null)}
          onChanged={onReload}
        />
      )}
      {compose}
    </div>
  );
}
