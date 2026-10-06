/**
 * The Plan tab: a **Goal Plan** over the active Character's colonies — "here
 * are my colonies and the products I want per day; what does each colony do,
 * and is it worth more than what they earn anyway?"
 *
 * The page wires reads to the engine and nothing else: `goalPlannerSnapshot`
 * reads, `goalPlannerModel` adapts, `planBest` / `planDiff` answer,
 * `goalPlanView` reads the answer, and `GoalPlannerRail` /
 * `GoalPlannerResults` draw. Goals and switched-off colonies are URL state
 * (the route owns them); the standing assumptions are device-local prefs; the
 * customs rate is the synced per-system override Colonies and Map read too.
 *
 * ## Layout
 *
 * DOM (and so tab) order is Goals, Colonies, Assumptions, results: the
 * inputs before the answer they drive. On a pointer a grid puts the three in
 * a rail beside the results, which span the rail's rows plus a trailing `1fr`
 * row so the rail panels stay packed at the top. On a phone the same order
 * stacks: Colonies and Assumptions start folded there, so the answer sits two
 * header rows below the goals. No CSS `order` — a reordered phone layout
 * would send keyboard and screen-reader users through a different sequence
 * than the one on screen (WCAG 2.4.3).
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { planBest, type BestPlan } from '@/engine/pi/planBest';
import { planDiff } from '@/engine/pi/planDiff';
import type { Goal, JumpsFn } from '@/engine/pi/goalTypes';
import { scheduleSync, setSyncedSetting } from '@/sync';
import { useJumpBasis, jumpsBetween } from '@/features/route/jumpBasis';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { PricesUnavailable } from './PricesUnavailable';
import { useCadence } from './cadencePref';
import { PI_MAP_HREF, PLAN_CUSTOMS_HASH } from './piPlanLink';
import { useSellHub } from './sellHub';
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
import { usePlanetRichness } from './richnessOverride';
import { parseGoals, plannableGoals, serializeGoals } from './goalsParam';
import {
  changeSteps,
  goalAttainment,
  planCaveats,
  shortfallHint,
  switchGainPerDay,
  typeGapPlanetTypes,
} from './goalPlanView';
import { productOptions } from './products';
import type { PlanPrices } from './planPrices';
import { AssumptionsSection, ColoniesSection, GoalsSection } from './GoalPlannerRail';
import {
  Changes,
  ColonyFit,
  Flow,
  Hauling,
  Headline,
  Shortfalls,
  type PlanNames,
} from './GoalPlannerResults';

const HOURS_PER_DAY = 24;
const MD_UP = '(min-width: 48rem)';

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

/** Item menus here read the page's Item Actions, which the Planetary Industry route provides. */
export function GoalPlannerPanel(props: GoalPlannerPanelProps) {
  return <GoalPlanner {...props} />;
}

function GoalPlanner({
  characterId,
  goals,
  onGoalsChange,
  disabled,
  onDisabledChange,
}: GoalPlannerPanelProps) {
  const { t } = useTranslation();
  const mdUp = useMediaQuery(MD_UP);
  // Phone-sized (44px) controls below `md`; the dense tier beside a pointer.
  const size = mdUp ? 'sm' : 'md';
  // Folded on a phone, open beside a pointer, until the pilot says otherwise.
  // `#customs` lands on the customs rate fields: Colonies open, first rate focused.
  const { hash } = useLocation();
  const [toCustoms, setToCustoms] = useState(hash === PLAN_CUSTOMS_HASH);
  const [coloniesOpen, setColoniesOpen] = useState<boolean | null>(toCustoms ? true : null);
  const [assumptionsOpen, setAssumptionsOpen] = useState<boolean | null>(null);

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
  const cadence = useCadence((state) => state.value);
  const hydrateCadence = useCadence((state) => state.hydrate);
  useEffect(() => {
    void hydratePrefs();
    void hydrateCadence();
  }, [hydratePrefs, hydrateCadence]);

  // Where the plan sells, and what it may buy there, are the shared PI
  // settings: the page strip and the settings form edit the same record.
  const { hub, buybackPct, buyTiers } = useSellHub();
  const buysAnything = buyTiers.length > 0;
  const buysP1 = buyTiers.includes(1);

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

  // --- Customs: edits layered over the snapshot, written through to the synced setting ---
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

  // --- Inputs, deferred so typing a rate never waits on a re-plan ---
  const restartHours = cadence.restartDays * HOURS_PER_DAY;
  const haulHours = cadence.haulDays * HOURS_PER_DAY;
  const richness = usePlanetRichness(characterId);
  const disabledSet = useMemo(() => new Set(disabled), [disabled]);
  const liveRows = useMemo(
    () =>
      snapshot && customsOverrides
        ? plannerColonies(snapshot, {
            restartHours,
            fallbackRatePerHour: prefs.fallbackRatePerHour,
            customsOverrides,
            disabled: disabledSet,
            ...(richness ? { richness } : {}),
          })
        : [],
    [snapshot, customsOverrides, restartHours, prefs.fallbackRatePerHour, disabledSet, richness]
  );
  const rows = useDeferredValue(liveRows);
  const products = useMemo(() => (pi ? productOptions(pi) : []), [pi]);
  const plannable = useMemo(() => new Set(products.map((p) => p.typeId)), [products]);

  // Once the payload is in, a goal it cannot plan (a hand-edited link) leaves the URL.
  useEffect(() => {
    if (plannable.size === 0) return;
    const kept = plannableGoals(goals, plannable);
    if (kept.length !== goals.length) onGoalsChange(kept);
  }, [goals, plannable, onGoalsChange]);

  // Keyed on the goals' serialized form: a new array with the same goals never re-plans.
  const goalsKey = useDeferredValue(serializeGoals(plannableGoals(goals, plannable)) ?? '');
  const plannedGoals = useMemo(() => parseGoals(goalsKey), [goalsKey]);

  // --- Jumps on the pilot's route basis: each colony's system to the hub, and
  // between colony systems for the host choice. The plan does not wait for
  // them: until they resolve every leg is unknown (no host is penalised) and
  // the plan is re-made when they land.
  const basis = useJumpBasis();
  const systemKey = useMemo(
    () => [...new Set(rows.map((row) => row.systemId))].sort((a, b) => a - b).join(','),
    [rows]
  );
  const [jumps, setJumps] = useState<{
    key: string;
    bySystem: Map<number, number | null>;
    /** Colony system to colony system, keyed `low-high`, for the host choice. */
    pairs: Map<string, number | null>;
  } | null>(null);
  const jumpsKey = `${basis.key}|${hub.systemId}|${systemKey}`;
  useEffect(() => {
    if (!basis.hydrated || systemKey === '') return;
    let cancelled = false;
    const ids = systemKey.split(',').map(Number);
    const count = (from: number, to: number) =>
      jumpsBetween(from, to, basis)
        .then((r) => (r.kind === 'known' ? r.jumps : null))
        .catch(() => null);
    const pairIds = ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b] as const));
    void Promise.all([
      Promise.all(ids.map((id) => count(id, hub.systemId))),
      Promise.all(pairIds.map(([a, b]) => count(a, b))),
    ]).then(([toHub, between]) => {
      if (cancelled) return;
      setJumps({
        key: jumpsKey,
        bySystem: new Map(ids.map((id, i) => [id, toHub[i]])),
        pairs: new Map(pairIds.map(([a, b], i) => [`${a}-${b}`, between[i]])),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [basis, hub.systemId, systemKey, jumpsKey]);
  const jumpsFn = useMemo((): JumpsFn | undefined => {
    if (jumps?.key !== jumpsKey) return undefined;
    const systemOf = new Map(rows.map((row) => [row.planetId, row.systemId]));
    return (from, to) => {
      const a = systemOf.get(from);
      if (a === undefined) return null;
      if (to === 'hub') return jumps.bySystem.get(a) ?? null;
      const b = systemOf.get(to);
      if (b === undefined) return null;
      if (a === b) return 0;
      return jumps.pairs.get(a < b ? `${a}-${b}` : `${b}-${a}`) ?? null;
    };
  }, [jumps, jumpsKey, rows]);

  const result = useMemo((): { best: BestPlan } | { error: true } | null => {
    if (!pi || !prices || !snapshot) return null;
    try {
      const best = planBest(
        {
          goals: plannedGoals,
          colonies: goalPlannerInput(rows),
          policy: plannerPolicy({ maxP0Types: prefs.maxP0Types, buyTiers }),
          books: priceBooks(prices, snapshot.accountingLevel, buybackPct),
          jumps: jumpsFn,
        },
        pi
      );
      return { best };
    } catch {
      return { error: true };
    }
  }, [pi, prices, snapshot, rows, plannedGoals, prefs.maxP0Types, buyTiers, buybackPct, jumpsFn]);

  const names = useMemo((): PlanNames | null => {
    if (!snapshot || !pi) return null;
    const systemOf = new Map(rows.map((row) => [row.planetId, row.systemId]));
    return {
      planet: (id) => snapshot.planetNames.get(id) ?? t('pi.planetLabel', { id }),
      systemOf: (id) => systemOf.get(id),
      hub,
      pi,
    };
  }, [snapshot, pi, rows, hub, t]);

  // --- States ---
  if (failedFor === characterId) {
    return <EmptyState title={t('piPlan.loadFailedTitle')} hint={t('piPlan.loadFailedHint')} />;
  }
  if (!snapshot || !pi || !names) return <Loading />;
  const systemName = (id: number) =>
    snapshot.systemNames.get(id) ?? t('piAdvisor.systemLabel', { id });
  const noColonies = snapshot.colonies.length === 0;

  let results: React.ReactNode;
  if (noColonies && !buysAnything) {
    results = (
      <EmptyState
        title={t('piPlan.noColoniesTitle')}
        hint={
          // Buying P1 covers P1 goals only; a P2+ goal needs a colony to host it.
          plannedGoals.length > 0 &&
          plannedGoals.every((goal) => products.find((p) => p.typeId === goal.typeId)?.tier === 1)
            ? `${t('piPlan.noColoniesHint')} ${t('piPlan.noColoniesBuyHint')}`
            : t('piPlan.noColoniesHint')
        }
        action={
          <Link className={inlineLinkClassName} to={PI_MAP_HREF}>
            {t('piPlan.openMap')}
          </Link>
        }
      />
    );
  } else if (!prices || !result) {
    results = <Loading />;
  } else if (prices.failed) {
    results = <PricesUnavailable />;
  } else if ('error' in result) {
    results = <EmptyState title={t('piPlan.planFailedTitle')} hint={t('piPlan.planFailedHint')} />;
  } else {
    const { best } = result;
    const planned = goalPlannerInput(rows);
    const hauling = planHauling(best.plan, best.baseline, pi, haulHours);
    const books = priceBooks(prices, snapshot.accountingLevel, buybackPct);
    const earnings = earningsNow(rows, pi, prices, books.salesTaxPct, buybackPct);
    const verdict =
      best.economics.status === 'costed'
        ? planVerdict(
            best.economics.liftPerHour * HOURS_PER_DAY,
            best.plan.haulEffort,
            best.baseline.haulEffort
          )
        : null;
    // Until distances land the plan is made without them and re-made after,
    // which can move the host: say so rather than announce a verdict twice.
    const distancesPending = jumpsFn === undefined && rows.length > 0;
    const hasGoals = plannedGoals.some((goal) => goal.unitsPerDay > 0);
    const steps = changeSteps(best.plan, planDiff(best.plan, planned), rows);
    results = (
      <div className="space-y-4">
        {noColonies && <p className="text-xs text-text-dim">{t('piPlan.noColoniesBuying')}</p>}
        <Headline
          best={best}
          earnings={earnings}
          verdict={hasGoals ? verdict : null}
          attainment={goalAttainment(best.plan.achieved)}
          caveats={planCaveats(best.plan.assignments, rows, {
            flows: best.plan.flows,
            baseline: best.baseline.perColony,
            valuedAtAsk: books.valuedAtAsk,
          })}
          hasGoals={hasGoals}
          pricesFetchedAt={prices.fetchedAt}
          distancesPending={distancesPending}
          names={names}
        />
        {hasGoals && (
          <>
            <Shortfalls
              shortfalls={best.plan.shortfalls}
              hints={best.plan.shortfalls.map((s) => shortfallHint(s, rows, buysP1))}
              names={names}
            />
            <Changes
              steps={steps}
              names={names}
              switchGainPerDay={(planetId) =>
                switchGainPerDay(planetId, best.baseline.perColony, earnings.byPlanet)
              }
            />
            <ColonyFit
              assignments={best.plan.assignments}
              rows={rows}
              steps={steps}
              names={names}
            />
            <Hauling
              hauling={hauling}
              plan={best.plan}
              baseline={best.baseline}
              haulHours={haulHours}
              haulDays={cadence.haulDays}
              distancesPending={distancesPending}
              names={names}
            />
            <Flow
              demand={best.plan.demand}
              typeGaps={typeGapPlanetTypes(best.plan.shortfalls)}
              names={names}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="grid items-start gap-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:grid-rows-[auto_auto_auto_1fr]">
      <div className="md:col-start-1 md:row-start-1">
        <GoalsSection goals={goals} products={products} onGoalsChange={onGoalsChange} size={size} />
      </div>
      <div className="md:col-start-1 md:row-start-2">
        <ColoniesSection
          rows={liveRows}
          planetName={names.planet}
          systemName={systemName}
          size={size}
          focusCustoms={toCustoms}
          expanded={coloniesOpen ?? mdUp}
          onToggleExpanded={() => {
            setToCustoms(false); // the deep link's focus is one-shot
            setColoniesOpen(!(coloniesOpen ?? mdUp));
          }}
          onToggle={(planetId, enabled) =>
            onDisabledChange(
              enabled ? disabled.filter((id) => id !== planetId) : [...disabled, planetId]
            )
          }
          onCustomsChange={writeCustoms}
        />
      </div>
      <div className="md:col-start-1 md:row-start-3">
        <AssumptionsSection
          hubName={hub.systemName}
          buybackPct={buybackPct}
          buyTiers={buyTiers}
          fallbackRate={prefs.fallbackRatePerHour}
          onFallbackRateChange={(rate) => void setPrefs({ ...prefs, fallbackRatePerHour: rate })}
          fallbackInUse={liveRows.some((row) =>
            [...(row.colony?.ratePerEcu.values() ?? [])].some((rate) => rate.source === 'assumed')
          )}
          maxP0Types={prefs.maxP0Types}
          onMaxP0TypesChange={(value) => void setPrefs({ ...prefs, maxP0Types: value })}
          cadence={cadence}
          size={size}
          expanded={assumptionsOpen ?? mdUp}
          onToggleExpanded={() => setAssumptionsOpen(!(assumptionsOpen ?? mdUp))}
        />
      </div>
      <div className="min-w-0 md:col-start-2 md:row-span-4 md:row-start-1">{results}</div>
    </div>
  );
}
