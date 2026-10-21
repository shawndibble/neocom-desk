/**
 * The Stock tab's landing view once the pilot stocks two or more markets:
 * one row per market, worst first, so the one that needs restocking is on
 * top. A row opens that market.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { SecurityStatus } from '@/components/SecurityStatus';
import {
  Button,
  DataAgeBadge,
  DataTable,
  EmptyState,
  IskAmount,
  LiveStatus,
  Panel,
  RowCaret,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { marketNeed } from '@/engine/stockTargets/markets';
import type { StockList } from '@/engine/stockTargets/stockLists';
import { useRetryFocus } from '@/lib/useRetryFocus';
import type { TradeHub } from '@/market/hubs';
import { StockNeedPill } from './StockStatus';
import { STOCK_PATH } from './StockMarketPage';
import { loadStockMarkets, type StockMarketRow, type StockMarketsData } from './stockTargetsData';
import { formatNumber } from '@/lib/numberLocale';

export function StockMarketsList({
  lists,
  hub,
  onNew,
}: {
  lists: readonly StockList[];
  hub: TradeHub;
  onNew: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; data: StockMarketsData } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const loadKey = `${JSON.stringify(lists)}|${hub.id}|${refreshKey}`;
  useEffect(() => {
    let cancelled = false;
    loadStockMarkets(lists, hub)
      .then((data) => {
        if (!cancelled) setLoaded({ key: loadKey, data });
      })
      .catch(() => {
        if (!cancelled) setFailedKey(loadKey);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `lists` and `hub` are captured through `loadKey`
  }, [loadKey]);
  const data = loaded?.data ?? null;
  const failed = failedKey === loadKey && loaded?.key !== loadKey;
  const loading = loaded?.key !== loadKey && !failed;
  const [resultsRef, , holdRetryFocus] = useRetryFocus(
    loading ? 'busy' : failed ? 'failed' : 'ok',
    'markets'
  );

  const hrefOf = (market: StockMarketRow) => `${STOCK_PATH}/${encodeURIComponent(market.listId)}`;
  const needWord = (market: StockMarketRow) => {
    const need = marketNeed(market);
    return need === 'stocked'
      ? t('stockTargets.need.stocked')
      : t(`stockTargets.need.${need}`, { count: market[need] });
  };
  // Left off a phone card: the need pill already says the market is fine there.
  const zero = (
    <span data-dense-omit className="text-text-dim">
      0
    </span>
  );

  const columns: DataTableColumn<StockMarketRow>[] = [
    {
      id: 'market',
      header: t('stockTargets.markets.market'),
      primary: true,
      render: (market) => (
        <>
          <Link
            to={hrefOf(market)}
            className="font-medium text-accent [overflow-wrap:anywhere] hover:underline"
            // The row is the tab stop and opens the market; the link stays for a middle-click.
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            {market.name}
          </Link>
          {market.place && (
            <span className="flex items-center gap-1 text-[0.6875rem] text-text-dim">
              {t(`stockTargets.place.${market.place.kind}`)}
              {market.place.systemName && ` · ${market.place.systemName}`}
              {market.place.security !== null && (
                <SecurityStatus security={market.place.security} />
              )}
            </span>
          )}
        </>
      ),
      sortValue: (market) => market.name,
    },
    {
      id: 'items',
      header: t('stockTargets.markets.items'),
      align: 'right',
      headerCellClassName: 'sm:w-20',
      className: 'tabular-nums',
      // Leads the phone card's meta line, so a stocked market's card still says something.
      render: (market) => (
        <>
          {formatNumber(market.items)}
          <span className="sm:hidden">
            {' '}
            {t('stockTargets.markets.itemsAffix', { count: market.items })}
          </span>
        </>
      ),
      sortValue: (market) => market.items,
    },
    {
      id: 'out',
      header: t('stockTargets.markets.out'),
      align: 'right',
      headerCellClassName: 'sm:w-16',
      className: 'tabular-nums',
      stackAffix: { after: ` ${t('stockTargets.markets.out').toLowerCase()}` },
      render: (market) => (market.out > 0 ? <b className="text-danger">{market.out}</b> : zero),
      sortValue: (market) => market.out,
    },
    {
      id: 'low',
      header: t('stockTargets.markets.low'),
      align: 'right',
      headerCellClassName: 'sm:w-16',
      className: 'tabular-nums',
      stackAffix: { after: ` ${t('stockTargets.markets.low').toLowerCase()}` },
      render: (market) => (market.low > 0 ? <b className="text-warning">{market.low}</b> : zero),
      sortValue: (market) => market.low,
    },
    {
      id: 'ready',
      header: t('stockTargets.markets.ready'),
      headerTooltip: t('stockTargets.summary.readyHint'),
      align: 'right',
      headerCellClassName: 'sm:w-32',
      className: 'tabular-nums',
      stackAffix: { after: ` ${t('stockTargets.markets.readyAffix')}` },
      render: (market) =>
        market.readyToList > 0 ? (
          <span className="text-accent">
            {t('stockTargets.markets.readyItems', { count: market.readyToList })}
          </span>
        ) : (
          <span data-dense-omit className="text-text-dim">
            {t('stockTargets.markets.none')}
          </span>
        ),
      sortValue: (market) => market.readyToList,
    },
    {
      id: 'toSource',
      header: t('stockTargets.markets.toSource'),
      headerTooltip: t('stockTargets.summary.toSourceHint', { hub: hub.name }),
      align: 'right',
      headerCellClassName: 'sm:w-36',
      className: 'tabular-nums whitespace-nowrap',
      stackAffix: { after: ` ${t('stockTargets.markets.toSourceAffix')}` },
      render: (market) =>
        market.costToFill > 0 ? (
          <>
            <IskAmount value={market.costToFill} /> ISK
          </>
        ) : (
          <span data-dense-omit className="text-text-dim">
            —
          </span>
        ),
      sortValue: (market) => market.costToFill,
    },
    {
      id: 'need',
      header: t('stockTargets.markets.need'),
      headerCellClassName: 'sm:w-24',
      cardCorner: true,
      render: (market) => (
        <StockNeedPill need={marketNeed(market)}>{needWord(market)}</StockNeedPill>
      ),
    },
    {
      id: 'go',
      header: '',
      align: 'right',
      headerCellClassName: 'sm:w-8',
      // Closes the phone card's meta line at its right edge, rather than adding a "·" to it.
      stackEdge: 'end',
      render: () => <RowCaret />,
    },
  ];

  const needing = data?.markets.filter((m) => marketNeed(m) !== 'stocked').length ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 data-stock-markets tabIndex={-1} className="text-lg font-semibold focus:outline-none">
          {t('stockTargets.markets.count', { count: lists.length })}
        </h2>
        {data?.oldestFetchedAt && <DataAgeBadge date={data.oldestFetchedAt} alwaysVisible />}
        {loading && data && <Spinner size="sm" label={t('common.loading')} />}
        <span className="flex-1" />
        <Button variant="primary" data-stock-new-market onClick={onNew}>
          {t('stockTargets.list.new')}
        </Button>
      </div>
      {data && data.incompleteCharacters.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          {t('stockTargets.incomplete', { names: data.incompleteCharacters.join(', ') })}
        </p>
      )}
      <LiveStatus>
        {failed
          ? t('stockTargets.loadFailedHint')
          : data && t('stockTargets.markets.liveSummary', { count: needing })}
      </LiveStatus>
      <div ref={resultsRef} tabIndex={-1} className="flex flex-col gap-3 focus:outline-none">
        {failed ? (
          <EmptyState
            title={t('common.loadFailedTitle')}
            hint={t('stockTargets.loadFailedHint')}
            action={
              <Button
                onClick={() => {
                  holdRetryFocus();
                  setRefreshKey((k) => k + 1);
                }}
              >
                {t('common.retry')}
              </Button>
            }
          />
        ) : !data ? (
          <Spinner label={t('common.loading')} />
        ) : (
          <Panel padded={false}>
            <DataTable
              columns={columns}
              rows={data.markets}
              rowKey={(market) => market.listId}
              label={t('stockTargets.markets.label')}
              stackLayout="dense"
              onRowClick={(market) => navigate(hrefOf(market))}
            />
          </Panel>
        )}
      </div>
    </div>
  );
}
