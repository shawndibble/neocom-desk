/**
 * "What does this skill cost to buy right now?" — the skill inspector's price
 * row (CONTEXT.md round 49 follow-up): sell price at a trade hub, a hub
 * picker (the same synced default `PriceHubSelect` already drives for
 * Fittings), and a link to open the item in the Market Browser. A skill's own
 * typeID is the tradeable item's typeID too — modern EVE has no separate
 * skillbook item — so this reads it directly, the same as `InjectorFactsPanel`
 * reads the Large Skill Injector's.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IskAmount } from '@/components/ui';
import { PriceHubSelect } from '@/features/fittings/PriceHubSelect';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPrices, type HubAggregate } from '@/market/prices';

export function SkillPriceSection({ typeID }: { typeID: number }) {
  const { t } = useTranslation();
  const hubId = useMarketHub((state) => state.value);
  const hubHydrated = useMarketHub((state) => state.hydrated);
  const hydrateHub = useMarketHub((state) => state.hydrate);
  useEffect(() => {
    void hydrateHub();
  }, [hydrateHub]);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  // What the currently-rendered `aggregate` (if any) was fetched for — a
  // hub or typeID change invalidates it immediately on render, rather than
  // showing the previous hub's price under the new hub's label until the
  // next fetch resolves.
  const priceKey = `${hub.id}:${typeID}`;

  const [priceResult, setPriceResult] = useState<{
    key: string;
    aggregate: HubAggregate | null;
  } | null>(null);
  useEffect(() => {
    if (!hubHydrated) return;
    let cancelled = false;
    void getHubPrices(hub, [typeID]).then((prices) => {
      if (cancelled) return;
      setPriceResult({ key: priceKey, aggregate: prices.get(typeID) ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [hub, hubHydrated, typeID, priceKey]);

  const aggregate = priceResult?.key === priceKey ? priceResult.aggregate : undefined;

  return (
    <section>
      <div className="flex items-center justify-between border-b border-line pb-1">
        <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('skills.inspector.priceTitle')}
        </h3>
        <PriceHubSelect />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs">
        <span className="text-text-dim">{t('skills.inspector.priceSell')}</span>
        {aggregate === undefined ? (
          <span className="text-text-dim">{t('common.loading')}</span>
        ) : aggregate?.sellMin == null ? (
          <span className="text-text-dim">{t('skills.inspector.priceNoSellOrders')}</span>
        ) : (
          <IskAmount value={aggregate.sellMin} revealOn="tap" />
        )}
      </div>
      <MarketItemLink
        typeId={typeID}
        hubId={hub.id}
        className="mt-1 inline-block text-xs text-accent hover:underline"
      >
        {t('skills.inspector.openInMarket')}
      </MarketItemLink>
    </section>
  );
}
