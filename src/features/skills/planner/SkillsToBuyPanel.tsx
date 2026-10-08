import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure, IskAmount, IskFigureGroup } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { useMarketHub } from '@/features/market/hub';
import { writeToClipboard } from '@/lib/clipboard';
import { formatIskCompact } from '@/lib/isk';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPrices, getRegionSellPrices } from '@/market/prices';
import { buildSkillsToBuy, skillsToBuyTypeIds } from './skillsToBuy';

interface SkillsToBuyPanelProps {
  entries: readonly { skillTypeID: number }[];
  trainedSkills: ReadonlyMap<number, unknown>;
  trainedSkillsKnown: boolean;
  nameFor: (skillTypeID: number) => string;
  /**
   * Render as its own closed-by-default `Disclosure` row, the total beside
   * the title, instead of as bare section content. Below `lg` the plan tools
   * are one collapsed row, which would bury this list; this row sits outside
   * them. The fetch, list, total and copy are this same component either way.
   */
  collapsible?: boolean;
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
  collapsible = false,
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
    void Promise.all([getHubPrices(hub, typeIds), getRegionSellPrices(hub.regionId, typeIds)])
      .then(([hubAgg, region]) => {
        if (cancelled) return;
        const hubMap = new Map<number, number | null>();
        for (const [id, agg] of hubAgg) hubMap.set(id, agg?.sellMin ?? null);
        setPrices({ key, hub: hubMap, region });
      })
      .catch(() => {
        // A failed fetch reads as "no sell orders", never as an endless "Loading".
        if (!cancelled) setPrices({ key, hub: new Map(), region: new Map() });
      });
    return () => {
      cancelled = true;
    };
    // typeIds is derived from typeKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub, hubHydrated, typeKey]);

  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [expanded, setExpanded] = useState(false);

  const loaded = prices !== null && prices.key === `${hub.id}:${typeKey}`;
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
    <Disclosure
      label={t('plans.skillsToBuy.title')}
      // Plain text, not `IskAmount`: its tooltip trigger is a tab stop, and a
      // second one inside the toggle button is nested interactive content.
      trailing={loaded && facts ? `${formatIskCompact(facts.total)} ISK` : undefined}
      expanded={expanded}
      onToggle={() => setExpanded((open) => !open)}
    >
      <div className="p-3">{content}</div>
    </Disclosure>
  );
}
