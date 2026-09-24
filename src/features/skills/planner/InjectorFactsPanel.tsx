import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IskAmount } from '@/components/ui';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPrices, type HubAggregate } from '@/market/prices';
import type { CloneState } from '@/engine/types';
import { buildInjectorFacts } from './injectorFacts';

/** public/data/market/types.json: "Large Skill Injector". */
const LARGE_SKILL_INJECTOR_TYPE_ID = 40520;
const LARGE_SKILL_INJECTOR_NAME = 'Large Skill Injector';

interface InjectorFactsPanelProps {
  scheduled: readonly { sp: number }[];
  totalSp: number | null;
  unallocatedSp: number | null;
  cloneState: CloneState;
}

/**
 * "Skill injectors" tools-pane section (issue #1408): every figure derived,
 * no typed-in estimate — the pilot decides whether covering the plan with
 * Large Skill Injectors is worth it, this just shows the facts.
 */
export function InjectorFactsPanel({
  scheduled,
  totalSp,
  unallocatedSp,
  cloneState,
}: InjectorFactsPanelProps) {
  const { t } = useTranslation();
  const hubId = useMarketHub((state) => state.value);
  const hubHydrated = useMarketHub((state) => state.hydrated);
  const hydrateHub = useMarketHub((state) => state.hydrate);
  useEffect(() => {
    void hydrateHub();
  }, [hydrateHub]);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;

  const [aggregate, setAggregate] = useState<HubAggregate | null>(null);
  // Distinct from `aggregate === null`, which also means "no sell orders" —
  // without this, the fetch's own in-flight window renders that same
  // (wrong) claim before the hub has actually answered.
  const [priceLoaded, setPriceLoaded] = useState(false);
  useEffect(() => {
    if (!hubHydrated) return;
    let cancelled = false;
    void getHubPrices(hub, [LARGE_SKILL_INJECTOR_TYPE_ID]).then((prices) => {
      if (cancelled) return;
      setAggregate(prices.get(LARGE_SKILL_INJECTOR_TYPE_ID) ?? null);
      setPriceLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [hub, hubHydrated]);

  const facts = buildInjectorFacts(scheduled, totalSp, unallocatedSp, aggregate);

  if (facts.spUnknown) {
    return <p className="text-[0.6875rem] text-text-dim">{t('plans.injectors.spUnknown')}</p>;
  }

  if (facts.none) {
    return <p className="text-[0.6875rem] text-text-dim">{t('plans.injectors.none')}</p>;
  }

  const priceCell = (value: number | null) => {
    if (!priceLoaded) return t('common.loading');
    return value === null ? (
      t('plans.injectors.noSellOrders', { hub: hub.name })
    ) : (
      <IskAmount value={value} revealOn="tap" />
    );
  };

  return (
    <div className="space-y-2 text-xs">
      <p className="text-[0.6875rem] text-text-dim">{t('plans.injectors.ifInjectedNow')}</p>
      <dl className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-text-dim">{t('plans.injectors.spToTrain')}</dt>
          <dd className="tabular-nums">{facts.spToTrain.toLocaleString()}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-text-dim">{t('plans.injectors.unallocated')}</dt>
          <dd className="tabular-nums">{(facts.unallocatedSp ?? 0).toLocaleString()}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-text-dim">{t('plans.injectors.gap')}</dt>
          <dd className="tabular-nums">{(facts.gapSp ?? 0).toLocaleString()}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-text-dim">{t('plans.injectors.count')}</dt>
          <dd className="flex items-center gap-1 tabular-nums">
            <span>{facts.count}</span>
            <MarketItemLink typeId={LARGE_SKILL_INJECTOR_TYPE_ID}>
              {LARGE_SKILL_INJECTOR_NAME}
            </MarketItemLink>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-text-dim">{t('plans.injectors.surplus')}</dt>
          <dd className="tabular-nums">{facts.surplusSp.toLocaleString()}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-text-dim">{t('plans.injectors.pricePer')}</dt>
          <dd>{priceCell(facts.pricePerInjector)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-text-dim">{t('plans.injectors.priceTotal')}</dt>
          <dd>{priceCell(facts.priceTotal)}</dd>
        </div>
      </dl>
      {cloneState === 'alpha' && <p className="text-warning">{t('plans.injectors.alphaCaveat')}</p>}
    </div>
  );
}
