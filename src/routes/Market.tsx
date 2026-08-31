import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, DataAgeBadge, EmptyState, Panel, Spinner } from '@/components/ui';
import { loadTypes } from '@/sde/loadSde';
import type { TypeMap } from '@/sde/types';
import { searchTypes, type TypeSearchResult } from '@/features/market/search';
import { TRADE_HUBS, DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { getHubPrices, clearMarketPriceCache, type HubAggregate } from '@/market/prices';
import { useMarketHub } from '@/features/market/hub';
import { addPin, removePin, MAX_PINS, type PinnedType } from '@/features/market/pins';
import { formatVolume, formatSignedPercent, computeSpreadPct } from '@/features/market/format';
import { formatIsk } from '@/lib/isk';
import { typeIconUrl } from '@/lib/eveImages';

/** Debounce for the SDE type-name search, so a fast typist doesn't re-scan the ~9k-entry map on every keystroke. */
const SEARCH_DEBOUNCE_MS = 250;

/** Type icon with a graceful fallback: some type IDs (skillbooks, blueprints) have no rendered icon on the image server. */
function TypeIcon({ typeId }: { typeId: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-xs border border-line bg-panel-2 text-[0.625rem] text-text-faint"
      >
        ?
      </span>
    );
  }
  return (
    <img
      src={typeIconUrl(typeId, 32)}
      alt=""
      width={32}
      height={32}
      onError={() => setFailed(true)}
      className="size-8 shrink-0 rounded-xs border border-line bg-panel-2"
    />
  );
}

/**
 * Market Browser: general item price lookup at a chosen Trade Hub (CONTEXT.md
 * — distinct from a character's own Market Orders). Search is local (SDE
 * type names, always available offline); prices come from Fuzzwork via
 * `getHubPrices`, which already degrades an unreachable Fuzzwork to
 * per-type nulls rather than throwing (see `features/industry/marketData.ts`).
 * Not gated on an active character — this is a general lookup tool.
 */
export function Market() {
  const { t } = useTranslation();
  const hubId = useMarketHub((state) => state.value);
  const hubHydrated = useMarketHub((state) => state.hydrated);
  const hydrateHub = useMarketHub((state) => state.hydrate);
  const setHubId = useMarketHub((state) => state.setValue);

  const [types, setTypes] = useState<TypeMap | null>(null);
  const [rawQuery, setRawQuery] = useState('');
  const [query, setQuery] = useState('');
  const [pins, setPins] = useState<PinnedType[]>([]);
  const [prices, setPrices] = useState<Map<number, HubAggregate>>(new Map());
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    void hydrateHub();
  }, [hydrateHub]);

  useEffect(() => {
    let cancelled = false;
    void loadTypes().then((result) => {
      if (!cancelled) setTypes(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setQuery(rawQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [rawQuery]);

  const results = useMemo(() => (types ? searchTypes(types, query) : []), [types, query]);
  const pinnedIds = useMemo(() => new Set(pins.map((p) => p.typeId)), [pins]);
  const pinnedKey = useMemo(
    () =>
      pins
        .map((p) => p.typeId)
        .sort((a, b) => a - b)
        .join(','),
    [pins]
  );

  // Refetches whenever the pinned set or the selected hub changes, and once
  // more per Refresh click (refreshTick). Gated on hubHydrated so this
  // doesn't fire once for the default hub and again once the persisted
  // 'marketHub' setting resolves.
  useEffect(() => {
    if (!hubHydrated || pins.length === 0) return;
    let cancelled = false;
    const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
    void (async () => {
      setPricesLoading(true);
      const result = await getHubPrices(
        hub,
        pins.map((p) => p.typeId)
      );
      if (cancelled) return;
      setPrices(result);
      setLastFetchedAt(Date.now());
      setPricesLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pinnedKey stands in for pins' typeIds; pins itself would re-run this on every pin/unpin re-render
  }, [pinnedKey, hubId, hubHydrated, refreshTick]);

  function handlePin(result: TypeSearchResult) {
    setPins((current) => addPin(current, result));
  }

  function handleUnpin(typeId: number) {
    setPins((current) => {
      const next = removePin(current, typeId);
      // Reset here (an event handler, not the fetch effect above) rather
      // than leaving a stale price/DataAgeBadge behind once nothing is
      // pinned — the effect only runs again once something is re-pinned.
      if (next.length === 0) {
        setPrices(new Map());
        setLastFetchedAt(null);
      }
      return next;
    });
  }

  function handleRefresh() {
    // Manual refresh must bypass getHubPrices' 15-min TTL cache (CONTEXT.md
    // "Data Age": refresh happens on app open + manual button only) rather
    // than re-rendering the same cached values under a freshened badge.
    // clearMarketPriceCache is documented "test-only" for its other callers
    // (src/market/prices.ts's own tests) — this is the one production caller
    // that needs a hard bypass. It clears the whole module-level cache, not
    // just this hub/these types, so it also evicts any cached Industry hub
    // price lookups; the collateral cost is small, just one extra live
    // refetch next time those run.
    clearMarketPriceCache();
    setRefreshTick((n) => n + 1);
  }

  const atCap = pins.length >= MAX_PINS;

  // Fuzzwork-unreachable degrades to per-type nulls (never a throw), so this
  // is the only signal available: every pinned item priced as fully
  // unpriceable, after a fetch actually completed. Indistinguishable from
  // "every pinned item genuinely has no orders at this hub" — the copy is
  // worded to be true either way, not asserted as "offline".
  const allUnpriced =
    pins.length > 0 &&
    lastFetchedAt !== null &&
    pins.every((p) => {
      const agg = prices.get(p.typeId);
      return !agg || (agg.sellMin === null && agg.buyMax === null);
    });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-widest uppercase">{t('market.title')}</h1>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs">
            <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('market.tradeHub')}
            </span>
            <select
              value={hubId}
              onChange={(e) => void setHubId(e.target.value as TradeHub['id'])}
              className="h-8 rounded-xs border border-line bg-panel-2 px-2 text-text"
            >
              {TRADE_HUBS.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.systemName}
                </option>
              ))}
            </select>
          </label>
          <Button size="sm" onClick={handleRefresh} disabled={pins.length === 0 || pricesLoading}>
            {t('market.refresh')}
          </Button>
        </div>
      </header>

      <Panel title={t('market.searchTitle')}>
        <input
          type="search"
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          placeholder={t('market.searchPlaceholder')}
          aria-label={t('market.searchLabel')}
          className="h-9 w-full rounded-xs border border-line bg-panel-2 px-3 text-xs text-text placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-accent"
        />

        {atCap && (
          <p className="pt-2 text-[0.6875rem] text-warning uppercase">
            {t('market.capHint', { max: MAX_PINS })}
          </p>
        )}

        {!types ? (
          <div className="flex justify-center py-8">
            <Spinner label={t('common.loading')} />
          </div>
        ) : query.trim() === '' ? (
          <p className="pt-3 text-xs text-text-dim">{t('market.searchHint')}</p>
        ) : results.length === 0 ? (
          <p className="pt-3 text-xs text-text-dim">{t('market.noResults')}</p>
        ) : (
          <ul className="mt-3 max-h-72 divide-y divide-line overflow-y-auto border-t border-line">
            {results.map((result) => {
              const pinned = pinnedIds.has(result.typeId);
              return (
                <li key={result.typeId} className="flex items-center gap-2 py-1.5">
                  <TypeIcon typeId={result.typeId} />
                  <span className="min-w-0 flex-1 truncate text-xs">{result.name}</span>
                  <Button size="sm" disabled={pinned || atCap} onClick={() => handlePin(result)}>
                    {pinned ? t('market.pinned') : t('market.pin')}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel
        title={t('market.compareTitle', { count: pins.length, max: MAX_PINS })}
        padded={false}
        actions={
          lastFetchedAt !== null ? <DataAgeBadge date={new Date(lastFetchedAt)} /> : undefined
        }
      >
        {pins.length === 0 ? (
          <EmptyState
            title={t('market.emptyTitle')}
            hint={t('market.emptyHint')}
            className="py-8"
          />
        ) : pricesLoading && prices.size === 0 ? (
          <div className="flex justify-center py-8">
            <Spinner label={t('common.loading')} />
          </div>
        ) : allUnpriced ? (
          <EmptyState
            title={t('market.noPriceTitle')}
            hint={t('market.noPriceHint')}
            className="py-8"
          />
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line text-left text-text-dim">
                <th className="px-3 py-2 font-semibold uppercase">{t('market.item')}</th>
                <th className="px-3 py-2 text-right font-semibold uppercase">{t('market.sell')}</th>
                <th className="px-3 py-2 text-right font-semibold uppercase">{t('market.buy')}</th>
                <th className="px-3 py-2 text-right font-semibold uppercase">
                  {t('market.spread')}
                </th>
                <th className="px-3 py-2 text-right font-semibold uppercase">
                  {t('market.sellVolume')}
                </th>
                <th className="px-3 py-2 text-right font-semibold uppercase">
                  {t('market.buyVolume')}
                </th>
                <th className="px-3 py-2">
                  <span className="sr-only">{t('market.remove')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {pins.map((pin) => {
                const agg = prices.get(pin.typeId);
                const spread = computeSpreadPct(agg?.sellMin ?? null, agg?.buyMax ?? null);
                return (
                  <tr key={pin.typeId}>
                    <td className="px-3 py-1.5">
                      <span className="flex items-center gap-2">
                        <TypeIcon typeId={pin.typeId} />
                        <span className="truncate">{pin.name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {agg?.sellMin != null ? (
                        formatIsk(agg.sellMin)
                      ) : (
                        <span className="text-text-dim">{t('common.unknown')}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {agg?.buyMax != null ? (
                        formatIsk(agg.buyMax)
                      ) : (
                        <span className="text-text-dim">{t('common.unknown')}</span>
                      )}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right tabular-nums ${
                        spread == null ? '' : spread >= 0 ? 'text-isk-pos' : 'text-isk-neg'
                      }`}
                    >
                      {spread != null ? (
                        formatSignedPercent(spread)
                      ) : (
                        <span className="text-text-dim">{t('common.unknown')}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {agg ? formatVolume(agg.sellVolume) : t('common.unknown')}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {agg ? formatVolume(agg.buyVolume) : t('common.unknown')}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Button size="sm" onClick={() => handleUnpin(pin.typeId)}>
                        {t('market.unpin')}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
