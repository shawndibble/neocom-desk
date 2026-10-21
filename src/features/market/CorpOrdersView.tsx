import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CachedEmptyState,
  CachedNotice,
  DataAgeBadge,
  DataTable,
  EmptyState,
  IconButton,
  LiveStatus,
  Panel,
  SearchInput,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import { loadCorpOrders } from '@/features/overview/widgets/data/corpFeedLoaders';
import { corpOrderRows } from '@/features/overview/widgets/data/corpOrdersModels';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { useUrlParam, useUrlSort } from '@/lib/useUrlState';
import { textParam } from '@/lib/urlState';
import type { OpenOrderRow } from './openOrdersModel';
import { useOpenOrderTableColumns } from './openOrdersTableColumns';
import {
  CharacterFilterControl,
  type CharacterScopeChoice,
} from '@/features/character/CharacterFilterControl';
import { PageHeaderPortals } from './PageHeaderPortals';
import type { PageHeaderSlots } from './pageHeaderSlots';

/** The corp view's own columns beyond the Item column: price, remaining, expiry. */
const CORP_OPTIONAL_COLUMNS = ['price', 'remaining', 'expires'] as const;
const CORP_SORT = { columnId: 'iskTiedUp', direction: 'desc' } as const;
const SEARCH_PARAM = textParam();

/**
 * The Market orders page's Corp scope: the corporation's open buy and sell
 * orders in the fix-list table, undercut judged by the station tier as on the
 * Character view. Cost basis, floors and Do-this-with-skills are per Character,
 * so the view shows none. Read-only: no order detail, no work-through.
 */
export function CorpOrdersView({
  headerSlots,
  onLeaveCorporation,
}: {
  headerSlots: PageHeaderSlots;
  /** The Character picker's way back: choosing "This character" clears `?scope=corp`. */
  onLeaveCorporation: () => void;
}) {
  const { t } = useTranslation();
  const { data, error, loading, activeCharacterId, refresh } = useRouteSnapshot(
    loadCorpOrders,
    undefined,
    { cacheKey: 'market:corp-orders' }
  );
  const [search, setSearch] = useUrlParam('corp.q', SEARCH_PARAM);

  // Orders read in days (expiry), so the clock at mount is fine for the visit.
  const [now] = useState(Date.now);
  const rows = useMemo(() => (data?.readable ? corpOrderRows(data, now) : []), [data, now]);
  const issuedBy = useMemo(
    () =>
      new Map(
        (data?.orders ?? []).map((order) => [
          order.order_id,
          data?.issuerNames.get(order.issued_by ?? 0) ?? '',
        ])
      ),
    [data]
  );
  const { columns: baseColumns } = useOpenOrderTableColumns({
    showCharacter: false,
    visible: CORP_OPTIONAL_COLUMNS,
    workThrough: false,
  });
  const columns = useMemo<DataTableColumn<OpenOrderRow>[]>(() => {
    const issuedByColumn: DataTableColumn<OpenOrderRow> = {
      id: 'issuedBy',
      header: t('market.orders.corp.issuedBy'),
      className: 'whitespace-nowrap',
      sortValue: (row) => issuedBy.get(row.orderId) ?? '',
      render: (row) => issuedBy.get(row.orderId) || <span className="text-text-dim">—</span>,
    };
    // Before the closing ISK tied up total.
    return [...baseColumns.slice(0, -1), issuedByColumn, baseColumns[baseColumns.length - 1]!];
  }, [baseColumns, issuedBy, t]);
  const sortProps = useUrlSort(
    'corp.sort',
    CORP_SORT,
    columns.map((c) => c.id)
  );

  const needle = search.trim().toLowerCase();
  const shown = useMemo(
    () =>
      needle === ''
        ? rows
        : rows.filter((row) =>
            [row.typeName, row.stationName ?? '', issuedBy.get(row.orderId) ?? '']
              .join('\n')
              .toLowerCase()
              .includes(needle)
          ),
    [rows, needle, issuedBy]
  );

  const header = (
    <PageHeaderPortals
      slots={headerSlots}
      meta={data?.fetchedAt ? <DataAgeBadge date={data.fetchedAt} /> : undefined}
      actions={
        <>
          <CharacterFilterControl<CharacterScopeChoice>
            size="md"
            hideAll
            corporation
            activeCharacterId={activeCharacterId}
            value="corporation"
            onChange={(next) => {
              if (next !== 'corporation') onLeaveCorporation();
            }}
          />
          <IconButton
            icon={<Icon.Refresh />}
            label={t('market.orders.refreshOrders')}
            onClick={refresh}
            disabled={loading}
          />
        </>
      }
    />
  );

  if (loading && !data) {
    return (
      <>
        {header}
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      </>
    );
  }

  let body;
  if (activeCharacterId === null) body = null;
  else if (error || !data) {
    body = <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />;
  } else if (data.needsReauth) {
    body = (
      <GrantBanner
        characterId={activeCharacterId}
        endpoints={['getCorporationOrders']}
        title={t('market.orders.corp.reauthTitle')}
        hint={t('market.orders.corp.reauthHint')}
        actionLabel={t('market.orders.corp.reauthAction')}
      />
    );
  } else if (!data.readable) {
    body = <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />;
  } else if (rows.length === 0) {
    body = (
      <CachedEmptyState
        result={{ fromCache: data.fromCache }}
        title={t('market.orders.corp.emptyTitle')}
        hint={t('market.orders.corp.emptyHint')}
        fetchedTitle={t('market.orders.corp.emptyFetchedTitle')}
        className="py-8"
      />
    );
  } else {
    body = (
      <div className="min-w-0 space-y-3">
        {data.fromCache && <CachedNotice fetchedAt={data.fetchedAt} />}
        <SearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('market.orders.corp.searchPlaceholder')}
          className="min-w-40"
        />
        <LiveStatus>
          {shown.length === 0
            ? t('orders.noResults')
            : needle !== '' &&
              t('market.orders.filter.matchCount', { count: shown.length, total: rows.length })}
        </LiveStatus>
        {shown.length === 0 ? (
          <EmptyState title={t('orders.noResults')} className="py-8" />
        ) : (
          <Panel padded={false}>
            <div className="min-w-0 overflow-x-auto">
              <DataTable
                {...sortProps}
                density="compact"
                columns={columns}
                rows={shown}
                rowKey={(row) => row.orderId}
                label={t('market.orders.corp.tableName')}
              />
            </div>
          </Panel>
        )}
      </div>
    );
  }

  return (
    <>
      {header}
      {body}
    </>
  );
}
