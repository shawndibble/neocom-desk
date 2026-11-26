import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure, IskAmount, IskFigureGroup, LiveStatus } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { useHubFor } from '@/features/market/hub';
import { writeToClipboard } from '@/lib/clipboard';
import { formatIskCompact } from '@/lib/isk';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getRegionSellPrices } from '@/market/prices';
import { getHubPricesWithStatusAt } from '@/features/market/hubPricesAtPercent';
import { atPercent, usePricePercentFor } from '@/features/market/pagePricePercents';
import { buildSkillsToBuy, skillsToBuyTypeIds } from './skillsToBuy';

interface SkillsToBuyPanelProps {
  entries: readonly { skillTypeID: number }[];
  trainedSkills: ReadonlyMap<number, unknown>;
  trainedSkillsKnown: boolean;
  nameFor: (skillTypeID: number) => string;
  collapsible?: boolean;
}

export function SkillsToBuyPanel({
  entries,
  trainedSkills,
  trainedSkillsKnown,
  nameFor,
  collapsible = false,
}: SkillsToBuyPanelProps) {
  const { t } = useTranslation();
  const pricesUnavailableLabel = usePricesUnavailableLabel();
  const { hubId, hydrated: hubHydrated } = useHubFor('skills');
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const percent = usePricePercentFor('skills');

  const typeIds = useMemo(
    () => (trainedSkillsKnown ? skillsToBuyTypeIds(entries, trainedSkills) : []),
    [entries, trainedSkills, trainedSkillsKnown]
  );
  const typeKey = typeIds.join(',');

  const [prices, setPrices] = useState<{
    key: string;
    hub: Map<number, number | null>;
    region: Map<number, number | null>;
    unreachable: boolean;
  } | null>(null);
  useEffect(() => {
    if (!hubHydrated || typeIds.length === 0) return;
    let cancelled = false;
    const key = `${hub.id}:${percent}:${typeKey}`;
    void Promise.all([
      getHubPricesWithStatusAt(hub, typeIds, percent),
      getRegionSellPrices(hub.regionId, typeIds),
    ])
      .then(([{ prices: hubAgg, unreachable }, region]) => {
        if (cancelled) return;
        const hubMap = new Map<number, number | null>();
        for (const [id, agg] of hubAgg) hubMap.set(id, agg?.sellMin ?? null);
        const regionMap = new Map<number, number | null>();
        for (const [id, price] of region)
          regionMap.set(id, price === null ? null : atPercent(price, percent));
        setPrices({ key, hub: hubMap, region: regionMap, unreachable });
      })
      .catch(() => {
        if (!cancelled) setPrices({ key, hub: new Map(), region: new Map(), unreachable: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub, hubHydrated, typeKey, percent]);

  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [copyCount, setCopyCount] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const loaded = prices !== null && prices.key === `${hub.id}:${percent}:${typeKey}`;
  const unreachable = loaded && prices.unreachable;
  const facts =
    trainedSkillsKnown && typeIds.length > 0
      ? buildSkillsToBuy(
          typeIds,
          nameFor,
          loaded ? prices.hub : new Map(),
          loaded ? prices.region : new Map()
        )
      : null;

  const copy = async () => {
    if (!facts) return;
    setCopyCount((n) => n + 1);
    try {
      await writeToClipboard(facts.multibuy);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  let content: ReactNode;
  if (!trainedSkillsKnown) {
    content = <p className="text-[0.6875rem] text-text-dim">{t('plans.skillsToBuy.unknown')}</p>;
  } else if (!facts) {
    content = <p className="text-[0.6875rem] text-text-dim">{t('plans.skillsToBuy.none')}</p>;
  } else {
    content = (
      <IskFigureGroup className="space-y-2 text-xs">
        <ul className="space-y-1">
          {facts.rows.map((row) => (
            <li key={row.typeID} className="flex items-center justify-between gap-2">
              <MarketItemLink typeId={row.typeID}>{row.name}</MarketItemLink>
              <span className="tabular-nums">
                {!loaded ? (
                  t('common.loading')
                ) : row.price === null ? (
                  <span className="text-text-dim">
                    {unreachable
                      ? pricesUnavailableLabel
                      : t('plans.skillsToBuy.noSellOrders', { hub: hub.name })}
                  </span>
                ) : (
                  <IskAmount value={row.price} />
                )}
              </span>
            </li>
          ))}
        </ul>
        {loaded && !unreachable && (
          <div className="flex items-center justify-between gap-2 border-t border-line pt-1">
            <span className="text-text-dim">{t('plans.skillsToBuy.total')}</span>
            <IskAmount value={facts.total} />
          </div>
        )}
        {loaded && !unreachable && facts.unpricedCount > 0 && (
          <p className="text-[0.6875rem] text-text-dim">
            {t('plans.skillsToBuy.unpriced', { count: facts.unpricedCount })}
          </p>
        )}
        <LiveStatus announceKey={copyCount}>
          {copyState === 'copied'
            ? t('plans.skillsToBuy.copied')
            : copyState === 'failed'
              ? t('plans.skillsToBuy.copyFailed')
              : null}
        </LiveStatus>
        <button type="button" className={inlineLinkClassName} onClick={() => void copy()}>
          {copyState === 'copied'
            ? t('plans.skillsToBuy.copied')
            : copyState === 'failed'
              ? t('plans.skillsToBuy.copyFailed')
              : t('plans.skillsToBuy.copy')}
        </button>
      </IskFigureGroup>
    );
  }

  if (!collapsible) return content;

  return (
    <>
      <Disclosure
        label={t('plans.skillsToBuy.title')}
        trailing={
          loaded && !unreachable && facts ? `${formatIskCompact(facts.total)} ISK` : undefined
        }
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
      >
        <div className="p-3">{content}</div>
      </Disclosure>
      {!expanded && loaded && facts && (
        <p className="px-2.5 pt-1 pb-2 pl-7 text-[0.6875rem] text-text-dim">
          {t('plans.skillsToBuy.rowSummary', {
            priced: facts.rows.length - facts.unpricedCount,
            unpriced: facts.unpricedCount,
          })}
        </p>
      )}
    </>
  );
}
