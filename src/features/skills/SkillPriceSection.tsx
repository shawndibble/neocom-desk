import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { InfoTooltip, IskAmount } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { PriceHubSelect } from '@/features/fittings/PriceHubSelect';
import { useHubFor } from '@/features/market/hub';
import { atPercent, usePricePercentFor } from '@/features/market/pagePricePercents';
import { getOrderBook } from '@/features/market/orderBook';
import { buildMarketParams, marketNearbyParams } from '@/engine/market/urlState';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { skillSellPrices, type SkillSellPrices } from './skillSellPrices';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

const NEARBY_JUMPS = '10';

function marketBrowserHref(params: Record<string, string>): string {
  return `/market/browser?${new URLSearchParams(params).toString()}`;
}

export function SkillPriceSection({
  typeID,
  npcPrice,
}: {
  typeID: number;
  npcPrice: number | null;
}) {
  const { t } = useTranslation();
  const { hubId, hydrated: hubHydrated } = useHubFor('skills');
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const percent = usePricePercentFor('skills');
  const priceKey = `${hub.id}:${typeID}`;

  const loadPrices = useCallback(
    () =>
      getOrderBook(hub.regionId, typeID).then((book) =>
        skillSellPrices(book.orders, hub.stationId)
      ),
    [hub.regionId, hub.stationId, typeID]
  );
  const priceLoad = useKeyedLoad(priceKey, loadPrices, !hubHydrated);
  const prices: SkillSellPrices | 'failed' | undefined =
    priceLoad.status === 'ready'
      ? priceLoad.data
      : priceLoad.status === 'failed'
        ? 'failed'
        : undefined;

  function marketPrice(pick: (p: SkillSellPrices) => number | null): ReactNode {
    if (prices === undefined) return <span className="text-text-dim">{t('common.loading')}</span>;
    if (prices === 'failed')
      return <span className="text-text-dim">{t('skills.inspector.priceUnavailable')}</span>;
    const value = pick(prices);
    return value === null ? (
      <span className="text-text-dim">{t('skills.inspector.priceNoSellOrders')}</span>
    ) : (
      <IskAmount value={atPercent(value, percent)} />
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between border-b border-line pb-1">
        <h3 className={eyebrowClassName}>{t('skills.inspector.priceTitle')}</h3>
        <PriceHubSelect area="skills" />
      </div>
      <dl className="mt-1 space-y-0.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-text-dim">
            {t('skills.inspector.priceHubSell', { hub: hub.systemName })}
          </dt>
          <dd>{marketPrice((p) => p.hub)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-text-dim">
            {t('skills.inspector.priceRegionSell', { region: hub.regionName })}
          </dt>
          <dd>{marketPrice((p) => p.region)}</dd>
        </div>
        {npcPrice !== null && (
          <div className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-1 text-text-dim">
              {t('skills.inspector.priceNpc')}
              <InfoTooltip
                label={t('common.aboutLabel', { label: t('skills.inspector.priceNpc') })}
                content={t('skills.inspector.priceNpcHint')}
              />
            </dt>
            <dd>
              <IskAmount value={npcPrice} />
            </dd>
          </div>
        )}
      </dl>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <Link
          to={marketBrowserHref(
            buildMarketParams(typeID, { mode: 'region', regionId: hub.regionId })
          )}
          className={inlineLinkClassName}
        >
          {t('skills.inspector.openInMarket')}
        </Link>
        <Link
          to={marketBrowserHref(marketNearbyParams(typeID, NEARBY_JUMPS))}
          className={inlineLinkClassName}
        >
          {t('skills.inspector.findNearby', { jumps: NEARBY_JUMPS })}
        </Link>
      </div>
    </section>
  );
}
