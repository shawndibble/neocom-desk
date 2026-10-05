/**
 * The recommendation model, fed from the live reads: the hook a tab calls to
 * get a `PlanAdvice` (`planAdviceModel.ts`) without owning any of its inputs.
 *
 * The colony snapshot, the hub's prices and the pilot's skills are three reads
 * on three clocks. Prices are keyed on the hub, so changing hub re-prices
 * without refetching a colony; the advice itself is a memo over them and the
 * prefs, so a cadence or market change recomputes without any read at all.
 *
 * Every read degrades rather than failing the tab: no prices means no advice
 * (the caller still has the snapshot, and shows status without money), and an
 * unknown skill is `null`, which the model prices conservatively.
 */
import { useEffect, useMemo, useState } from 'react';
import { loadCommandCenterUpgrades } from '../colonyBudget';
import { useCadence, cadenceHours } from '../cadencePref';
import {
  loadGoalPlannerPrices,
  loadGoalPlannerSnapshot,
  type GoalPlannerSnapshot,
} from '../goalPlannerSnapshot';
import { useGoalPlannerPrefs } from '../goalPlannerPrefs';
import { loadInterplanetaryConsolidation } from '../planetSlots';
import type { PlanPrices } from '../planPrices';
import { buildPlanAdvice, hubBooks, type PlanAdvice } from '../planAdviceModel';
import { useSellHub } from '../sellHub';

export interface ColoniesAdviceState {
  /** The colony reads the advice was built from; null while loading or after a failure. */
  snapshot: GoalPlannerSnapshot | null;
  /** Null until prices and skills are in, or when the model could not price this pilot. */
  advice: PlanAdvice | null;
  /** The snapshot read failed outright. */
  failed: boolean;
}

/**
 * @param reloadKey Any value that changes when the colonies must be re-read
 *   (the route's own load stamp), so a manual refresh reaches this read too.
 */
export function useColoniesAdvice(
  characterId: number | null,
  reloadKey: number
): ColoniesAdviceState {
  const [loaded, setLoaded] = useState<{
    characterId: number;
    snapshot: GoalPlannerSnapshot;
    ccLevel: number | null;
    consolidation: number | null;
  } | null>(null);
  const [failedFor, setFailedFor] = useState<number | null>(null);

  useEffect(() => {
    if (characterId === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const snapshot = await loadGoalPlannerSnapshot(characterId);
        const [ccLevel, consolidation] = await Promise.all([
          loadCommandCenterUpgrades(characterId, snapshot.nowMs).catch(() => null),
          loadInterplanetaryConsolidation(characterId, snapshot.nowMs).catch(() => null),
        ]);
        if (cancelled) return;
        setFailedFor(null);
        setLoaded({ characterId, snapshot, ccLevel, consolidation });
      } catch {
        if (!cancelled) setFailedFor(characterId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, reloadKey]);
  const current = loaded?.characterId === characterId ? loaded : null;
  const snapshot = current?.snapshot ?? null;

  const { hub, buybackPct } = useSellHub();
  const cadence = useCadence((state) => state.value);
  const hydrateCadence = useCadence((state) => state.hydrate);
  const prefs = useGoalPlannerPrefs((state) => state.value);
  const hydratePrefs = useGoalPlannerPrefs((state) => state.hydrate);
  useEffect(() => {
    void hydrateCadence();
    void hydratePrefs();
  }, [hydrateCadence, hydratePrefs]);

  const pi = snapshot?.pi ?? null;
  const [priced, setPriced] = useState<{ hubId: string; prices: PlanPrices } | null>(null);
  useEffect(() => {
    if (!pi) return;
    let cancelled = false;
    void loadGoalPlannerPrices(hub, pi).then(
      (prices) => {
        if (!cancelled) setPriced({ hubId: hub.id, prices });
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [pi, hub, reloadKey]);
  const prices = priced?.hubId === hub.id ? priced.prices : null;

  const advice = useMemo(() => {
    if (!current || !prices) return null;
    try {
      return buildPlanAdvice({
        snapshot: current.snapshot,
        prefs: {
          restartHours: cadenceHours(cadence).restartHours,
          fallbackRatePerHour: prefs.fallbackRatePerHour,
          customsOverrides: current.snapshot.customsOverrides,
        },
        books: hubBooks(prices, current.snapshot.accountingLevel),
        market: buybackPct === null ? { kind: 'hub' } : { kind: 'buyback', pct: buybackPct },
        cadence,
        preference: 'isk',
        recipeFilter: 'any',
        skills: {
          commandCenterUpgrades: current.ccLevel,
          interplanetaryConsolidation: current.consolidation,
        },
        planetNames: current.snapshot.planetNames,
      });
    } catch {
      return null;
    }
  }, [current, prices, cadence, prefs.fallbackRatePerHour, buybackPct]);

  return { snapshot, advice, failed: failedFor === characterId && characterId !== null };
}
