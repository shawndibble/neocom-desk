import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IskAmount } from '@/components/ui';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPricesWithStatus, type HubAggregate } from '@/market/prices';
import { LARGE_SKILL_INJECTOR_TYPE_ID } from '@/engine/skills/spExtraction';
import { ALPHA_SP_CAP } from '@/engine/skills/skillInjectors';
import type { CloneState } from '@/engine/types';
import { buildInjectorFacts } from './injectorFacts';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { createNumberFormat, formatNumber } from '@/lib/numberLocale';

// Part-trained levels bank fractional SP; the old default printed up to 3 decimals.
const formatSp = createNumberFormat({ maximumFractionDigits: 3 });

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
  const pricesUnavailableLabel = usePricesUnavailableLabel();
  const hubId = useMarketHub((state) => state.value);
  const hubHydrated = useHydratedStore(useMarketHub);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;

  const [aggregate, setAggregate] = useState<HubAggregate | null>(null);
  // Distinct from `aggregate === null`, which also means "no sell orders" —
  // without this, the fetch's own in-flight window renders that same
  // (wrong) claim before the hub has actually answered.
  const [priceLoaded, setPriceLoaded] = useState(false);
  // The price source could not be reached: a null aggregate then means
  // "unknown", not "no sell orders".
  const [unreachable, setUnreachable] = useState(false);
  useEffect(() => {
    if (!hubHydrated) return;
    let cancelled = false;
    void getHubPricesWithStatus(hub, [LARGE_SKILL_INJECTOR_TYPE_ID]).then(
      ({ prices, unreachable }) => {
        if (cancelled) return;
        setAggregate(prices.get(LARGE_SKILL_INJECTOR_TYPE_ID) ?? null);
        setUnreachable(unreachable);
        setPriceLoaded(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [hub, hubHydrated]);

  const facts = buildInjectorFacts(scheduled, totalSp, unallocatedSp, aggregate, cloneState);

  if (facts.spUnknown) {
    return <p className="text-[0.6875rem] text-text-dim">{t('plans.injectors.spUnknown')}</p>;
  }

  if (facts.none) {
    return <p className="text-[0.6875rem] text-text-dim">{t('plans.injectors.none')}</p>;
  }

  const priceCell = (value: number | null) => {
    if (!priceLoaded) return t('common.loading');
    if (value === null && unreachable) return pricesUnavailableLabel;
    return value === null ? (
      t('plans.injectors.noSellOrders', { hub: hub.name })
    ) : (
      <IskAmount value={value} />
    );
  };

  return (
    <div className="space-y-2 text-xs">
      <p className="text-[0.6875rem] text-text-dim">{t('plans.injectors.ifInjectedNow')}</p>
      <dl className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-text-dim">{t('plans.injectors.spToTrain')}</dt>
          <dd className="tabular-nums">{formatSp(facts.spToTrain)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-text-dim">{t('plans.injectors.unallocated')}</dt>
          <dd className="tabular-nums">{formatNumber(facts.unallocatedSp ?? 0)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-text-dim">{t('plans.injectors.gap')}</dt>
          <dd className="tabular-nums">{formatSp(facts.gapSp ?? 0)}</dd>
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
          <dd className="tabular-nums">{formatSp(facts.surplusSp)}</dd>
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
      {facts.alphaShortfallSp > 0 && (
        <p className="text-warning">
          {t('plans.injectors.alphaOverCap', {
            sp: formatNumber(facts.alphaShortfallSp),
            cap: formatNumber(ALPHA_SP_CAP),
          })}
        </p>
      )}
      {cloneState === 'alpha' && facts.alphaShortfallSp === 0 && (
        <p className="text-warning">{t('plans.injectors.alphaCaveat')}</p>
      )}
    </div>
  );
}
