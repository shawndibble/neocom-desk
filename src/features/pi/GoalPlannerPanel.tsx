/**
 * The Plan tab: a **Goal Plan** over the active Character's colonies — "here
 * are my colonies and the products I want per day; what does each colony do,
 * and is it worth more than what they earn anyway?"
 *
 * The page wires reads to the engine and nothing else: `goalPlannerSnapshot`
 * reads, `goalPlannerModel` adapts, `planBest` / `planDiff` answer, and
 * `GoalPlannerRail` / `GoalPlannerResults` draw. Goals and switched-off
 * colonies are URL state (the route owns them, so a plan survives a reload
 * and the Industry "PI Plan" link can seed one); the standing assumptions are
 * device-local prefs; the customs rate is the synced per-system override the
 * Advisor writes too.
 *
 * Layout is a rail beside the results on a pointer and stacked above them on
 * a phone, by DOM order — the results' own order (Headline first) is the
 * phone's reading order and must not depend on a visual reorder.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
import { GrantBanner } from '@/app/GrantNote';
import { planBest, type BestPlan } from '@/engine/pi/planBest';
import { planDiff } from '@/engine/pi/planDiff';
import type { Goal } from '@/engine/pi/goalTypes';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { scheduleSync, setSyncedSetting } from '@/sync';
import { useJumpBasis, jumpsBetween } from '@/features/route/jumpBasis';
import { useCadence } from './cadencePref';
import { useMarketSourcing } from './marketSourcingPref';
import {
  SYNCED_PI_CUSTOMS_KEY,
  withCustomsOverride,
  withoutCustomsOverride,
  type CustomsOverrides,
} from './customsOverride';
import { useGoalPlannerPrefs } from './goalPlannerPrefs';
import {
  earningsNow,
  goalPlannerInput,
  planHauling,
  planVerdict,
  plannerColonies,
  plannerPolicy,
  priceBooks,
} from './goalPlannerModel';
import {
  loadGoalPlannerPrices,
  loadGoalPlannerSnapshot,
  type GoalPlannerSnapshot,
} from './goalPlannerSnapshot';
import { plannableGoals } from './goalsParam';
import { productOptions } from './products';
import type { PlanPrices } from './planPrices';
import { AssumptionsSection, ColoniesSection, GoalsSection } from './GoalPlannerRail';
import { ChangeList, ColonyFit, Flow, Hauling, Headline, Shortfalls } from './GoalPlannerResults';

const HOURS_PER_DAY = 24;

export interface GoalPlannerPanelProps {
  characterId: number;
  goals: Goal[];
  onGoalsChange: (goals: Goal[]) => void;
  /** Planet ids switched off. */
  disabled: number[];
  onDisabledChange: (ids: number[]) => void;
}

function Loading() {
  const { t } = useTranslation();
  return (
    <div className="flex justify-center py-16">
      <Spinner label={t('common.loading')} />
    </div>
  );
}

export function GoalPlannerPanel({
  characterId,
  goals,
  onGoalsChange,
  disabled,
  onDisabledChange,
}: GoalPlannerPanelProps) {
  const { t } = useTranslation();

  // --- Reads ---
  const [loaded, setLoaded] = useState<{
    characterId: number;
    snapshot: GoalPlannerSnapshot;
  } | null>(null);
  const [failedFor, setFailedFor] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadGoalPlannerSnapshot(characterId).then(
      (snapshot) => {
        if (cancelled) return;
        setFailedFor(null);
        setLoaded({ characterId, snapshot });
      },
      () => {
        if (!cancelled) setFailedFor(characterId);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [characterId]);
  const snapshot = loaded?.characterId === characterId ? loaded.snapshot : null;

  // --- Prefs ---
  const prefs = useGoalPlannerPrefs((state) => state.value);
  const hydratePrefs = useGoalPlannerPrefs((state) => state.hydrate);
  const setPrefs = useGoalPlannerPrefs((state) => state.setValue);
  const sourcing = useMarketSourcing((state) => state.value);
  const hydrateSourcing = useMarketSourcing((state) => state.hydrate);
  const setSourcing = useMarketSourcing((state) => state.setValue);
  const cadence = useCadence((state) => state.value);
  const hydrateCadence = useCadence((state) => state.hydrate);
  const setCadence = useCadence((state) => state.setValue);
  useEffect(() => {
    void hydratePrefs();
    void hydrateSourcing();
    void hydrateCadence();
  }, [hydratePrefs, hydrateSourcing, hydrateCadence]);

  // Buying is the shared sourcing pref: when it names a hub, that hub prices
  // the plan too, so the Advisor and the planner never disagree on a market.
  const buyP1 = sourcing !== 'none';
  const hub: TradeHub =
    (buyP1 ? getTradeHub(sourcing) : getTradeHub(prefs.priceHub)) ?? DEFAULT_TRADE_HUB;
  const setHub = (id: TradeHub['id']) => {
    void setPrefs({ ...prefs, priceHub: id });
    if (buyP1) void setSourcing(id);
  };
  const setBuyP1 = (buy: boolean) => void setSourcing(buy ? hub.id : 'none');

  // --- Prices, keyed on the hub so a hub switch never refetches colonies ---
  const [priced, setPriced] = useState<{ hubId: string; prices: PlanPrices } | null>(null);
  const pi = snapshot?.pi ?? null;
  useEffect(() => {
    if (!pi) return;
    let cancelled = false;
    void loadGoalPlannerPrices(hub, pi).then((prices) => {
      if (!cancelled) setPriced({ hubId: hub.id, prices });
    });
    return () => {
      cancelled = true;
    };
  }, [pi, hub]);
  const prices = priced?.hubId === hub.id ? priced.prices : null;

  // --- Customs: edits layered over the snapshot, written through like the Advisor's ---
  const [customsEdits, setCustomsEdits] = useState<CustomsOverrides | null>(null);
  const customsOverrides = customsEdits ?? snapshot?.customsOverrides ?? null;
  const writeCustoms = useCallback(
    (systemId: number, percent: number | null) => {
      const current = customsEdits ?? snapshot?.customsOverrides ?? {};
      const next =
        percent === null
          ? withoutCustomsOverride(current, systemId)
          : withCustomsOverride(current, systemId, percent / 100);
      setCustomsEdits(next);
      void setSyncedSetting(SYNCED_PI_CUSTOMS_KEY, next)
        .then(() => scheduleSync(characterId))
        .catch(() => {});
    },
    [characterId, customsEdits, snapshot]
  );

  // --- The answer ---
  const restartHours = cadence.restartDays * HOURS_PER_DAY;
  const haulHours = cadence.haulDays * HOURS_PER_DAY;
  const disabledSet = useMemo(() => new Set(disabled), [disabled]);
  const rows = useMemo(
    () =>
      snapshot && customsOverrides
        ? plannerColonies(snapshot, {
            restartHours,
            fallbackRatePerHour: prefs.fallbackRatePerHour,
            customsOverrides,
            disabled: disabledSet,
          })
        : [],
    [snapshot, customsOverrides, restartHours, prefs.fallbackRatePerHour, disabledSet]
  );
  const products = useMemo(() => (pi ? productOptions(pi) : []), [pi]);
  const activeGoals = useMemo(
    () => plannableGoals(goals, new Set(products.map((product) => product.typeId))),
    [goals, products]
  );

  const result = useMemo((): { best: BestPlan } | { error: true } | null => {
    if (!pi || !prices || !snapshot) return null;
    try {
      const colonies = goalPlannerInput(rows);
      const best = planBest(
        {
          goals: activeGoals,
          colonies,
          policy: plannerPolicy({ maxP0Types: prefs.maxP0Types, buyP1 }),
          books: priceBooks(prices, snapshot.accountingLevel),
        },
        pi
      );
      return { best };
    } catch {
      return { error: true };
    }
  }, [pi, prices, snapshot, rows, activeGoals, prefs.maxP0Types, buyP1]);

  // --- Jumps from each colony's system to the hub, on the pilot's route basis ---
  const basis = useJumpBasis();
  const systemIds = useMemo(
    () => [...new Set(rows.map((row) => row.systemId))].sort((a, b) => a - b),
    [rows]
  );
  const systemKey = systemIds.join(',');
  const [jumps, setJumps] = useState<{ key: string; bySystem: Map<number, number | null> } | null>(
    null
  );
  const jumpsKey = `${basis.key}|${hub.systemId}|${systemKey}`;
  useEffect(() => {
    if (!basis.hydrated || systemKey === '') return;
    let cancelled = false;
    const ids = systemKey.split(',').map(Number);
    void Promise.all(
      ids.map((id) =>
        jumpsBetween(id, hub.systemId, basis)
          .then((r) => (r.kind === 'known' ? r.jumps : null))
          .catch(() => null)
      )
    ).then((counts) => {
      if (cancelled) return;
      setJumps({ key: jumpsKey, bySystem: new Map(ids.map((id, i) => [id, counts[i]])) });
    });
    return () => {
      cancelled = true;
    };
  }, [basis, hub.systemId, systemKey, jumpsKey]);
  const jumpsByPlanet = useMemo(() => {
    const out = new Map<number, number | null>();
    if (jumps?.key !== jumpsKey) return out;
    for (const row of rows) {
      const count = jumps.bySystem.get(row.systemId);
      if (count !== undefined) out.set(row.planetId, count);
    }
    return out;
  }, [jumps, jumpsKey, rows]);

  // --- States ---
  if (failedFor === characterId) {
    return <EmptyState title={t('piPlan.loadFailedTitle')} hint={t('piPlan.loadFailedHint')} />;
  }
  if (!snapshot || !pi) return <Loading />;
  if (snapshot.needsReauth) {
    return (
      <GrantBanner
        characterId={characterId}
        endpoints={['getCharacterPlanets']}
        title={t('pi.reauthTitle')}
        hint={t('pi.reauthHint')}
        actionLabel={t('pi.reauthAction')}
      />
    );
  }

  const planetName = (id: number) => snapshot.planetNames.get(id) ?? t('pi.planetLabel', { id });
  const systemName = (id: number) =>
    snapshot.systemNames.get(id) ?? t('piAdvisor.systemLabel', { id });
  const noColonies = snapshot.colonies.length === 0;

  const rail = (
    <div className="space-y-4">
      <GoalsSection goals={goals} products={products} onGoalsChange={onGoalsChange} />
      <ColoniesSection
        rows={rows}
        planetName={planetName}
        systemName={systemName}
        onToggle={(planetId, enabled) =>
          onDisabledChange(
            enabled ? disabled.filter((id) => id !== planetId) : [...disabled, planetId]
          )
        }
        onCustomsChange={writeCustoms}
      />
      <AssumptionsSection
        hubId={hub.id}
        onHubChange={setHub}
        buyP1={buyP1}
        onBuyP1Change={setBuyP1}
        fallbackRate={prefs.fallbackRatePerHour}
        onFallbackRateChange={(rate) => void setPrefs({ ...prefs, fallbackRatePerHour: rate })}
        fallbackInUse={rows.some((row) =>
          [...(row.colony?.ratePerEcu.values() ?? [])].some((rate) => rate.source === 'assumed')
        )}
        maxP0Types={prefs.maxP0Types}
        onMaxP0TypesChange={(value) => void setPrefs({ ...prefs, maxP0Types: value })}
        cadence={cadence}
        onCadenceChange={(next) => void setCadence(next)}
      />
    </div>
  );

  let results: React.ReactNode;
  if (noColonies && !buyP1) {
    results = (
      <EmptyState
        title={t('piPlan.noColoniesTitle')}
        hint={t('piPlan.noColoniesHint')}
        action={
          <Link className="text-accent hover:underline" to="/planetary-industry/advisor">
            {t('piPlan.openAdvisor')}
          </Link>
        }
      />
    );
  } else if (!prices || !result) {
    results = <Loading />;
  } else if (prices.failed) {
    results = (
      <EmptyState title={t('piPlan.pricesFailedTitle')} hint={t('piPlan.pricesFailedHint')} />
    );
  } else if ('error' in result) {
    results = <EmptyState title={t('piPlan.planFailedTitle')} hint={t('piPlan.planFailedHint')} />;
  } else {
    const { best } = result;
    const hauling = planHauling(best.plan, best.baseline, pi, haulHours);
    const earnings = earningsNow(
      rows,
      pi,
      prices,
      priceBooks(prices, snapshot.accountingLevel).salesTaxPct
    );
    const verdict =
      best.economics.status === 'costed'
        ? planVerdict(
            best.economics.liftPerHour * HOURS_PER_DAY,
            hauling.planM3PerTrip,
            hauling.baselineM3PerTrip
          )
        : null;
    const baselineP1s = (planetId: number) => {
      const own = best.baseline.perColony.get(planetId);
      return own?.status === 'ok' ? own.slots.map((slot) => slot.p1TypeId) : [];
    };
    const hasGoals = activeGoals.some((goal) => goal.unitsPerDay > 0);
    results = (
      <div className="space-y-4">
        {noColonies && <p className="text-xs text-text-dim">{t('piPlan.noColoniesBuying')}</p>}
        <Headline
          best={best}
          earnings={earnings}
          verdict={hasGoals ? verdict : null}
          hasGoals={hasGoals}
          pi={pi}
          hub={hub}
        />
        {hasGoals && (
          <>
            <Shortfalls
              shortfalls={best.plan.shortfalls}
              achieved={best.plan.achieved}
              pi={pi}
              planetName={planetName}
            />
            <ChangeList
              changes={planDiff(best.plan, goalPlannerInput(rows))}
              pi={pi}
              planetName={planetName}
              baselineP1s={baselineP1s}
            />
            <ColonyFit
              assignments={best.plan.assignments}
              rows={rows}
              pi={pi}
              planetName={planetName}
            />
            <Hauling
              hauling={hauling}
              jumpsByPlanet={jumpsByPlanet}
              haulDays={cadence.haulDays}
              hub={hub}
              planetName={planetName}
            />
            <Flow demand={best.plan.demand} pi={pi} hub={hub} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="grid items-start gap-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      {rail}
      <div className="min-w-0">{results}</div>
    </div>
  );
}
