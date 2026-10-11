/**
 * Market › Stock: the markets the pilot stocks (issue #3521). `/market/stock`
 * lists them worst first, or opens the only one; `/market/stock/<list id>`
 * opens one. A shared market arrives as `?list=<code>` on either.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { decodeStockListShare } from '@/engine/stockTargets/stockListShare';
import { addStockList, type StockList } from '@/engine/stockTargets/stockLists';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { MarketDialog, type MarketChoice } from './MarketDialog';
import { SHARE_PARAM, STOCK_PATH, StockMarketPage } from './StockMarketPage';
import { StockMarketsList } from './StockMarketsList';
import { newStockListId, useSelectedStockList, useStockLists } from './stockListsStore';

/** The list id in `stock/<id>`, from the Market route's wildcard. */
function listIdFromPath(wildcard: string): string | null {
  const [tab, id] = wildcard.split('/');
  return tab === 'stock' && id ? decodeURIComponent(id) : null;
}

export function StockTab({ activeCharacterId }: { activeCharacterId: number | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const lists = useStockLists((state) => state.value);
  const hydrated = useStockLists((state) => state.hydrated);
  const hydrateLists = useStockLists((state) => state.hydrate);
  const setLists = useStockLists((state) => state.setValue);
  const setSelectedId = useSelectedStockList((state) => state.setValue);
  const hydrateSelected = useSelectedStockList((state) => state.hydrate);
  const hubId = useMarketHub((state) => state.value);
  const hydrateHub = useMarketHub((state) => state.hydrate);
  useEffect(() => {
    void hydrateLists();
    void hydrateSelected();
    void hydrateHub();
  }, [hydrateLists, hydrateSelected, hydrateHub]);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;

  const listId = listIdFromPath(useParams()['*'] ?? '');
  const [creating, setCreating] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const sharedCode = searchParams.get(SHARE_PARAM);
  const shared = sharedCode ? decodeStockListShare(sharedCode) : null;

  const open = (id: string) => navigate(`${STOCK_PATH}/${encodeURIComponent(id)}`);
  const save = (next: StockList[]) => void setLists(next);
  // "Set stock target…" elsewhere defaults to the market last opened here.
  const list =
    listId !== null
      ? lists.find((l) => l.id === listId)
      : lists.length === 1
        ? lists[0]
        : undefined;
  useEffect(() => {
    if (list) void setSelectedId(list.id);
  }, [list, setSelectedId]);

  function create(choice: MarketChoice) {
    const id = newStockListId();
    save(addStockList(lists, { id, ...choice }));
    open(id);
  }

  function dismissShared() {
    setSearchParams(
      (params) => {
        params.delete(SHARE_PARAM);
        return params;
      },
      { replace: true }
    );
  }

  if (!hydrated) return <Spinner label={t('common.loading')} />;

  const sharedBanner = shared && (
    <div
      role="region"
      aria-label={t('stockTargets.share.bannerLabel')}
      className="flex flex-wrap items-center gap-2 rounded-xs border border-accent-dim bg-panel px-3 py-2 text-sm"
    >
      {/* Its own line on a phone, so the buttons wrap under it rather than squeeze it. */}
      <span className="min-w-0 basis-full sm:basis-auto sm:flex-1">
        {t('stockTargets.share.banner', { name: shared.name, count: shared.items.length })}
      </span>
      <Button
        variant="primary"
        onClick={() => {
          const id = newStockListId();
          save(addStockList(lists, { id, ...shared }));
          dismissShared();
          open(id);
        }}
      >
        {t('stockTargets.share.save')}
      </Button>
      <Button onClick={dismissShared}>{t('stockTargets.share.dismiss')}</Button>
    </div>
  );
  const newDialog = creating && (
    <MarketDialog
      mode="new"
      characterId={activeCharacterId}
      onSubmit={create}
      onClose={() => setCreating(false)}
    />
  );

  let body;
  if (list) {
    body = (
      <StockMarketPage
        key={list.id}
        list={list}
        lists={lists}
        hub={hub}
        activeCharacterId={activeCharacterId}
        showBack={lists.length > 1}
        onSave={save}
        onDeleted={() => navigate(STOCK_PATH)}
        onNew={() => setCreating(true)}
      />
    );
  } else if (listId !== null) {
    body = (
      <EmptyState
        title={t('stockTargets.markets.gone')}
        action={<Link to={STOCK_PATH}>{t('stockTargets.markets.back')}</Link>}
      />
    );
  } else if (lists.length === 0) {
    body = (
      <EmptyState
        title={t('stockTargets.emptyTitle')}
        hint={t('stockTargets.emptyHint')}
        action={
          <Button variant="primary" data-stock-new-market onClick={() => setCreating(true)}>
            {t('stockTargets.list.new')}
          </Button>
        }
      />
    );
  } else {
    body = <StockMarketsList lists={lists} hub={hub} onNew={() => setCreating(true)} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {sharedBanner}
      {body}
      {newDialog}
    </div>
  );
}
