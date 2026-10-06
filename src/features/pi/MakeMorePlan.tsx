import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { EmptyState, IskFigureGroup, Spinner } from '@/components/ui';
import { clampIskZero, formatIskCompact } from '@/lib/isk';
import { AssumedCustomsNote } from './AssumedCustomsNote';
import { BiggerChainsPanel } from './BiggerChainsPanel';
import { assumedCustomsNames } from './colonyCustoms';
import { PricesUnavailable } from './PricesUnavailable';
import type { GoalPlannerSnapshot } from './goalPlannerSnapshot';
import {
  ChecklistPanel,
  HaulingPanel,
  QuickWinsPanel,
  RebuildPanel,
  YourPlanetsPanel,
  type Ticks,
} from './MakeMoreSections';
import { buildPlanView, coveredPlanets, pruneTicks, tickableIds, type PlanView } from './planView';
import { usePiSettings, withHaulBetweenPlanets } from './piSettings';
import { usePlanPreference, usePlanTicks } from './planTicksPref';
import { priceSourceLabel } from './priceSource';
import { useSellHub } from './sellHub';
import { usePlanAdvice } from './usePlanAdvice';

interface Props {
  snapshot: GoalPlannerSnapshot;
  characterId: number;
  /** Switch the picker to "Find the best thing to build". */
  onFindBest: () => void;
}

/** The sentence a screen reader hears when the plan recomputes. */
function headlineText(view: PlanView, t: ReturnType<typeof useTranslation>['t']): string {
  const { headline } = view;
  const parts: string[] = [];
  // Never "add 0 ISK a day": no wins says nothing, wins with no gain (saves, unpriced) give time only.
  if (view.quickWins.length > 0) {
    parts.push(
      headline.quickWinPerDay > 0
        ? t('piPlan.make.liveQuick', {
            gain: formatIskCompact(headline.quickWinPerDay),
            count: headline.quickWinMinutes,
          })
        : t('piPlan.make.liveQuickNoGain', { count: headline.quickWinMinutes })
    );
  }
  if (headline.rebuildCount > 0) {
    parts.push(
      t(
        clampIskZero(headline.rebuildGainPerDay, 0) < 0
          ? 'piPlan.make.liveRebuildCost'
          : 'piPlan.make.liveRebuild',
        {
          gain: formatIskCompact(Math.abs(headline.rebuildGainPerDay)),
          count: headline.rebuildCount,
        }
      )
    );
  }
  if (view.stats.unknownColonies > 0) {
    parts.push(t('piPlan.make.liveUnknown', { count: view.stats.unknownColonies }));
  }
  return parts.join(' ');
}

/**
 * "Make more from my planets": the recommendation model, drawn. The page
 * wires reads to `buildPlanAdvice` (`usePlanAdvice`), shapes the answer
 * (`buildPlanView`) and draws it (`MakeMoreSections`).
 */
export function MakeMorePlan({ snapshot, characterId, onFindBest }: Props) {
  const { t } = useTranslation();
  const location = useLocation();
  const preference = usePlanPreference((state) => state.value);
  const hydratePreference = usePlanPreference((state) => state.hydrate);
  const setPreference = usePlanPreference((state) => state.setValue);
  const ticked = usePlanTicks((state) => state.value);
  const ticksHydrated = usePlanTicks((state) => state.hydrated);
  const hydrateTicks = usePlanTicks((state) => state.hydrate);
  const setTicked = usePlanTicks((state) => state.setValue);
  useEffect(() => {
    void hydratePreference();
    void hydrateTicks();
  }, [hydratePreference, hydrateTicks]);

  const state = usePlanAdvice(snapshot, characterId, preference);
  const { buybackPct } = useSellHub();
  const piSettings = usePiSettings((s) => s.value);
  const setPiSettings = usePiSettings((s) => s.setValue);
  const haulBetween = piSettings.haulBetweenPlanets === true;
  const view = useMemo(
    () =>
      (state.status === 'ready' || state.status === 'prices-failed') && state.advice
        ? buildPlanView(state.advice, snapshot.pi, (id) => t('pi.planetLabel', { id }))
        : null,
    [state, snapshot.pi, t]
  );

  // A row that is gone takes its tick with it.
  useEffect(() => {
    // With prices down the list is shorter: pruning now would drop ticks on wins that return.
    if (!view || !ticksHydrated || state.status !== 'ready') return;
    const kept = pruneTicks(ticked, tickableIds(view), coveredPlanets(view));
    if (kept.length !== ticked.length) void setTicked(kept);
  }, [view, ticked, ticksHydrated, setTicked, state.status]);

  const ticks = useMemo<Ticks>(() => {
    const set = new Set(ticked);
    return {
      has: (id) => set.has(id),
      toggle: (id) =>
        void setTicked(set.has(id) ? ticked.filter((x) => x !== id) : [...ticked, id]),
    };
  }, [ticked, setTicked]);

  // `#plan-hek-vi` scrolls to that colony's card once the plan is drawn.
  const hash = location.hash;
  const scrollTarget = view && hash.startsWith('#plan-') ? hash.slice(1) : null;
  const scrollOnce = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView?.({ block: 'start' });
    el.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (scrollTarget) scrollOnce(scrollTarget);
  }, [scrollTarget, scrollOnce, location.key]);

  if (state.status === 'prices-failed') {
    // A win that needs no price (restart a stopped extractor) still stands; every figure is hidden.
    return (
      <div className="space-y-4">
        <PricesUnavailable />
        {view && view.quickWins.length > 0 && (
          <IskFigureGroup>
            <QuickWinsPanel view={view} ticks={ticks} pricesDown />
          </IskFigureGroup>
        )}
      </div>
    );
  }
  if (state.status === 'error') {
    return <EmptyState title={t('piPlan.make.failedTitle')} hint={t('piPlan.make.failedHint')} />;
  }
  if (state.status === 'loading' || !view) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (view.empty) {
    return (
      <EmptyState
        title={t('piPlan.make.emptyTitle')}
        hint={
          view.excluded.length > 0 ? t('piPlan.make.emptyExcludedHint') : t('piPlan.make.emptyHint')
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div role="status" aria-live="polite" className="sr-only">
        {headlineText(view, t)}
      </div>
      <AssumedCustomsNote
        names={assumedCustomsNames(state.advice.colonies, (id) => t('pi.planetLabel', { id }))}
      />
      <IskFigureGroup>
        <YourPlanetsPanel
          view={view}
          preference={preference}
          onPreference={(value) => void setPreference(value)}
          onFindBest={onFindBest}
          priceSource={priceSourceLabel(t, state.hubName, buybackPct)}
          haulBetween={haulBetween}
          onHaulBetween={(on) => void setPiSettings(withHaulBetweenPlanets(piSettings, on))}
        />
      </IskFigureGroup>
      {view.quickWins.length > 0 && (
        <IskFigureGroup>
          <QuickWinsPanel view={view} ticks={ticks} />
        </IskFigureGroup>
      )}
      <IskFigureGroup>
        <RebuildPanel view={view} />
      </IskFigureGroup>
      {/* Its own section, opted in: nothing in it enters a pick, a quick win or a total above. */}
      {haulBetween && (
        <IskFigureGroup>
          <BiggerChainsPanel advice={state.advice} pi={snapshot.pi} />
        </IskFigureGroup>
      )}
      <IskFigureGroup>
        <HaulingPanel hauling={view.hauling} hubName={state.hubName} />
      </IskFigureGroup>
      <IskFigureGroup>
        <ChecklistPanel view={view} ticks={ticks} />
      </IskFigureGroup>
    </div>
  );
}
