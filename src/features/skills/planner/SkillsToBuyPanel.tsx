import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IskAmount } from '@/components/ui';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { useMarketHub } from '@/features/market/hub';
import { writeToClipboard } from '@/lib/clipboard';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPrices, getRegionSellPrices } from '@/market/prices';
import { buildSkillsToBuy, skillsToBuyTypeIds } from './skillsToBuy';

interface SkillsToBuyPanelProps {
  entries: readonly { skillTypeID: number }[];
  trainedSkills: ReadonlyMap<number, unknown>;
  trainedSkillsKnown: boolean;
  nameFor: (skillTypeID: number) => string;
}

/**
 * "Skills to buy" tools-pane section (issue #2825): the plan's untrained
 * skills, each priced at the selected hub, with a total and a multibuy copy.
 */
export function SkillsToBuyPanel({
  entries,
  trainedSkills,
  trainedSkillsKnown,
  nameFor,
}: SkillsToBuyPanelProps) {
  const { t } = useTranslation();
  const hubId = useMarketHub((state) => state.value);
  const hubHydrated = useMarketHub((state) => state.hydrated);
  const hydrateHub = useMarketHub((state) => state.hydrate);
  useEffect(() => {
    void hydrateHub();
  }, [hydrateHub]);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;

  const typeIds = useMemo(
    () => (trainedSkillsKnown ? skillsToBuyTypeIds(entries, trainedSkills) : []),
    [entries, trainedSkills, trainedSkillsKnown]
  );
  const typeKey = typeIds.join(',');

  const [prices, setPrices] = useState<{
    key: string;
    hub: Map<number, number | null>;
    region: Map<number, number | null>;
  } | null>(null);
  useEffect(() => {
    if (!hubHydrated || typeIds.length === 0) return;
    let cancelled = false;
    const key = `${hub.id}:${typeKey}`;
    void Promise.all([getHubPrices(hub, typeIds), getRegionSellPrices(hub.regionId, typeIds)]).then(
      ([hubAgg, region]) => {
        if (cancelled) return;
        const hubMap = new Map<number, number | null>();
        for (const [id, agg] of hubAgg) hubMap.set(id, agg?.sellMin ?? null);
        setPrices({ key, hub: hubMap, region });
      }
    );
    return () => {
      cancelled = true;
    };
    // typeIds is derived from typeKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub, hubHydrated, typeKey]);

  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  if (!trainedSkillsKnown) {
    return <p className="text-[0.6875rem] text-text-dim">{t('plans.skillsToBuy.unknown')}</p>;
  }
  if (typeIds.length === 0) {
    return <p className="text-[0.6875rem] text-text-dim">{t('plans.skillsToBuy.none')}</p>;
  }

  const loaded = prices !== null && prices.key === `${hub.id}:${typeKey}`;
  const facts = buildSkillsToBuy(
    typeIds,
    nameFor,
    loaded ? prices.hub : new Map(),
    loaded ? prices.region : new Map()
  );

  const copy = async () => {
    try {
      await writeToClipboard(facts.multibuy);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <div className="space-y-2 text-xs">
      <ul className="space-y-1">
        {facts.rows.map((row) => (
          <li key={row.typeID} className="flex items-center justify-between gap-2">
            <MarketItemLink typeId={row.typeID}>{row.name}</MarketItemLink>
            <span className="tabular-nums">
              {!loaded ? (
                t('common.loading')
              ) : row.price === null ? (
                <span className="text-text-dim">
                  {t('plans.skillsToBuy.noSellOrders', { hub: hub.name })}
                </span>
              ) : (
                <IskAmount value={row.price} />
              )}
            </span>
          </li>
        ))}
      </ul>
      {loaded && (
        <div className="flex items-center justify-between gap-2 border-t border-border pt-1">
          <span className="text-text-dim">{t('plans.skillsToBuy.total')}</span>
          <IskAmount value={facts.total} />
        </div>
      )}
      {loaded && facts.unpricedCount > 0 && (
        <p className="text-[0.6875rem] text-text-dim">
          {t('plans.skillsToBuy.unpriced', { count: facts.unpricedCount })}
        </p>
      )}
      <button
        type="button"
        className="text-accent underline-offset-2 hover:underline"
        onClick={() => void copy()}
      >
        {copyState === 'copied'
          ? t('plans.skillsToBuy.copied')
          : copyState === 'failed'
            ? t('plans.skillsToBuy.copyFailed')
            : t('plans.skillsToBuy.copy')}
      </button>
    </div>
  );
}
