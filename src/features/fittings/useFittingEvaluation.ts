/**
 * Fitting evaluation: what the dogma engine sees for a Fitting and a pilot,
 * and the numbers that come back. Every stats caller goes through here —
 * the editor (`useFittingWorkspace`), the logged-out Fitting Share Code view, the
 * Variations panel, the applied-DPS overlay and Fitting Compare — so the
 * engine inputs are assembled in one place:
 *
 * - the pilot's skills, with the implants/boosters the implant basis picks
 *   (the pilot's own clone, or the set the Fitting carries);
 * - the pilot's selected Damage Profile, and nothing at all until its
 *   stored value has been read, so a pilot who picked Guristas doesn't get
 *   a uniform calculation thrown away a moment later.
 *
 * Before this, each caller assembled those itself and kept missing one
 * (Variations forgot the Damage Profile, then the basis; the share view
 * forgot the Damage Profile). `dogmaFittingEngine.ts` stays the seam to the
 * engine itself (ADR 0016); this module sits above it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyImplantBasis, type ImplantBasis } from '@/engine/fittings/implantBasis';
import type { Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';
import type { Appraisal } from '@/engine/market/appraisal';
import { useMarketHub } from '@/features/market/hub';
import { getTradeHub, DEFAULT_TRADE_HUB } from '@/market/hubs';
import { useStatsConditions } from './statsConditions';
import { useChargeBasis } from './useChargeBasis';
import { useDamageProfiles, type DamageProfiles } from './damageProfiles';
import { explainModule, type ChargeBasis, type DogmaAssetProgress } from './dogmaFittingEngine';
import type { AffectedAttribute } from '@/engine/fittings/affectedBy';
import { loadFittingPrice } from './fittingPrice';
import { useDogmaEngine } from './fittingContext';
import { useRetryOnReconnect } from '@/lib/useRetryOnReconnect';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { useHydratedStore } from '@/lib/useHydratedStore';
import {
  offThreadStatsUnder,
  sharedBaseline,
  skillGainEvaluator,
  statsUnder,
  underBasis,
  variantEvaluator,
  type SkillGainEvaluator,
  type VariantEvaluator,
} from './evaluationBasis';

export { evaluateFitting, evaluateImplantSet } from './evaluationBasis';
export type { SkillGainEvaluator, VariantEvaluator };

export interface FittingEvaluationInput {
  fitting: Fitting | null;
  /** The pilot's own skills and clone; null while loading. */
  profile: PilotProfile | null;
  /** "My clone" vs the Fitting's own set, already resolved for this Fitting. */
  implantBasis: ImplantBasis;
}

export interface FittingEvaluation {
  /**
   * The latest stats. After an edit to the same hull these are the previous
   * fit's until the new calculation lands, so the bars don't blank on every
   * click. A different hull drops them at once.
   */
  stats: FittingStats | null;
  /**
   * The stats of exactly the Fitting given, or null while its calculation is
   * pending — what anything read per module (module results, a Load's drone
   * launch) must use, since `stats` can be the previous edit's.
   */
  currentStats: FittingStats | null;
  /** The Abyssal weather `stats` were worked out in (null: normal space) — which lags a new pick until it lands. */
  statsWeatherTypeId: number | null;
  statsProgress: DogmaAssetProgress | null;
  statsError: boolean;
  /** Calculates again after `statsError` — the engine refetches its assets if those failed. */
  retry: () => void;
  /** The Damage Profile every evaluation's EHP is measured against, and the pilot's custom ones. */
  damageProfiles: DamageProfiles;
  /** The open Fitting at the default Trade Hub; independent of the engine, so usually first. */
  price: Appraisal | null;
  /** Null until the pilot, the Damage Profile and the engine are all ready. */
  variants: VariantEvaluator | null;
  /**
   * What changed each attribute of the open Fitting's module at
   * `moduleIndex` ("Affected by"), under exactly what its stats are worked
   * out under. Null until the pilot, the Damage Profile and the engine are ready.
   */
  explainModule: ((moduleIndex: number) => Promise<AffectedAttribute[]>) | null;
  /** What the Charge Picker works a charge out under — the stats' own basis; null until the pilot and the Damage Profile are ready. */
  chargeBasis: ChargeBasis | null;
  /** "What to train"; null until the pilot, the Damage Profile and the engine are ready. */
  skillGains: SkillGainEvaluator | null;
  /**
   * The open Fitting in normal space and inside Abyssal weather
   * `weatherTypeId`, both under the page's other conditions (Overheat all
   * included). Null until ready.
   */
  compareWeather:
    ((weatherTypeId: number) => Promise<{ before: FittingStats; after: FittingStats }>) | null;
}

export function useFittingEvaluation({
  fitting,
  profile,
  implantBasis,
}: FittingEvaluationInput): FittingEvaluation {
  const damageProfiles = useDamageProfiles();
  const damageProfile = damageProfiles.hydrated ? damageProfiles.selected : null;
  const conditions = useStatsConditions();

  // Keyed on the carried set, not the Fitting: an edit that leaves the set
  // alone keeps this object, and with it `variants` and its baseline.
  const implantSet = fitting?.implantSet;
  const pilot = useMemo(
    () => (profile === null ? null : applyImplantBasis(profile, implantSet, implantBasis)),
    [profile, implantSet, implantBasis]
  );

  const [stats, setStats] = useState<{
    fitting: Fitting;
    stats: FittingStats;
    weatherTypeId: number | null;
  } | null>(null);
  const [statsProgress, setStatsProgress] = useState<DogmaAssetProgress | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const engine = useDogmaEngine();
  // A failure while offline mends itself when the connection returns.
  useRetryOnReconnect(statsError, retry);

  // A different hull (or none) is a different Fitting: drop the old numbers at
  // once rather than show them under the new one's header — a swap from one
  // open Fitting straight to another (a new paste, a pasted link,
  // Back/Forward). An edit to the same hull keeps them until the
  // recalculation below lands, so the bars don't blank on every click.
  const hullTypeId = fitting?.shipTypeId ?? null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new hull, not a render-time derivation
    setStats(null);
    setStatsProgress(null);
  }, [hullTypeId]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new calculation, not a render-time derivation
    setStatsError(false);
    if (fitting === null || pilot === null || damageProfile === null) return;
    void (async () => {
      try {
        const result = await statsUnder(
          fitting,
          { pilot, damageProfile, conditions },
          {
            onProgress: (progress) => {
              if (!cancelled) setStatsProgress(progress);
            },
          }
        );
        if (cancelled) return;
        setStats({ fitting, stats: result, weatherTypeId: conditions.weatherTypeId });
      } catch {
        if (!cancelled) setStatsError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fitting, pilot, damageProfile, conditions, attempt]);

  // Priced at the pilot's Trade Hub (Settings, or the Price section's select).
  const hubId = useMarketHub((state) => state.value);
  const hubHydrated = useHydratedStore(useMarketHub);

  // The clone's implants are already bought: priced like the multibuy list, without them.
  const cloneImplants = profile?.implantTypeIds;
  // Keyed by hull: a different hull drops the old price, an edit refreshes behind it.
  const loadPrice = useCallback(async () => {
    const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
    return loadFittingPrice(fitting!, hub, cloneImplants);
  }, [fitting, hubId, cloneImplants]);
  const price: Appraisal | null =
    useKeyedLoad(fitting === null ? null : String(fitting.shipTypeId), loadPrice, !hubHydrated)
      .data ?? null;

  // One baseline for Variations and "What to train" alike.
  const evaluators = useMemo(() => {
    if (fitting === null || pilot === null || damageProfile === null || engine === null)
      return null;
    const basis = { pilot, damageProfile, conditions };
    const baseline = sharedBaseline(fitting, basis);
    return {
      variants: variantEvaluator(fitting, basis, engine, baseline),
      skillGains: skillGainEvaluator(fitting, basis, engine, baseline),
    };
  }, [fitting, pilot, damageProfile, conditions, engine]);

  const chargeBasis = useChargeBasis(pilot, damageProfile, conditions);

  const compareWeather = useMemo(() => {
    if (fitting === null || pilot === null || damageProfile === null) return null;
    return async (weatherTypeId: number) => {
      const under = (weather: number | null) =>
        offThreadStatsUnder(
          fitting,
          { pilot, damageProfile, conditions: { ...conditions, weatherTypeId: weather } },
          { overheated: false }
        );
      const [before, after] = await Promise.all([under(null), under(weatherTypeId)]);
      return { before, after };
    };
  }, [fitting, pilot, damageProfile, conditions]);

  const explain = useMemo(
    () =>
      fitting === null || pilot === null || damageProfile === null || engine === null
        ? null
        : (moduleIndex: number) =>
            underBasis({ pilot, damageProfile, conditions }, (under, options) =>
              explainModule(fitting, under, moduleIndex, damageProfile, options)
            ),
    [fitting, pilot, damageProfile, conditions, engine]
  );

  return {
    stats: stats?.stats ?? null,
    currentStats: stats !== null && stats.fitting === fitting ? stats.stats : null,
    statsWeatherTypeId: stats?.weatherTypeId ?? null,
    statsProgress,
    statsError,
    retry,
    damageProfiles,
    price,
    variants: evaluators?.variants ?? null,
    explainModule: explain,
    skillGains: evaluators?.skillGains ?? null,
    chargeBasis,
    compareWeather,
  };
}
