import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyImplantBasis, type ImplantBasis } from '@/engine/fittings/implantBasis';
import type { Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';
import type { Appraisal } from '@/engine/market/appraisal';
import { useHubFor } from '@/features/market/hub';
import { usePricePercentFor } from '@/features/market/pagePricePercents';
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
  profile: PilotProfile | null;
  implantBasis: ImplantBasis;
}

export interface FittingEvaluation {
  stats: FittingStats | null;
  currentStats: FittingStats | null;
  statsWeatherTypeId: number | null;
  statsProgress: DogmaAssetProgress | null;
  statsError: boolean;
  retry: () => void;
  damageProfiles: DamageProfiles;
  price: Appraisal | null;
  variants: VariantEvaluator | null;
  explainModule: ((moduleIndex: number) => Promise<AffectedAttribute[]>) | null;
  chargeBasis: ChargeBasis | null;
  skillGains: SkillGainEvaluator | null;
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
  useRetryOnReconnect(statsError, retry);

  const hullTypeId = fitting?.shipTypeId ?? null;
  const [statsHull, setStatsHull] = useState(hullTypeId);
  if (statsHull !== hullTypeId) {
    setStatsHull(hullTypeId);
    setStats(null);
    setStatsProgress(null);
  }

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

  const { hubId, hydrated: hubHydrated } = useHubFor('fittings');
  const percent = usePricePercentFor('fittings');

  const cloneImplants = profile?.implantTypeIds;
  const loadPrice = useCallback(async () => {
    const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
    return loadFittingPrice(fitting!, hub, cloneImplants, percent);
  }, [fitting, hubId, cloneImplants, percent]);
  const price: Appraisal | null =
    useKeyedLoad(fitting === null ? null : String(fitting.shipTypeId), loadPrice, !hubHydrated)
      .data ?? null;

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
