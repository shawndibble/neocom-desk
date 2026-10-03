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
import {
  applyImplantBasis,
  defaultImplantBasis,
  type ImplantBasis,
} from '@/engine/fittings/implantBasis';
import type { DamageProfile, Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';
import type { Appraisal } from '@/engine/market/appraisal';
import { useMarketHub } from '@/features/market/hub';
import { getTradeHub, DEFAULT_TRADE_HUB } from '@/market/hubs';
import {
  pilotUnder,
  statsOptions,
  useStatsConditions,
  type StatsConditions,
} from './statsConditions';
import { useDamageProfiles, type DamageProfiles } from './damageProfiles';
import {
  computeFittingStats,
  explainModule,
  fittingSkillSources,
  isDogmaEngineReady,
  type DogmaAssetProgress,
  type StatsOptions,
} from './dogmaFittingEngine';
import type { AffectedAttribute } from '@/engine/fittings/affectedBy';
import { loadFittingPrice } from './fittingPrice';
import { NO_SKILL_OVERRIDES, withSkillLevel } from '@/engine/fittings/skillOverrides';
import { allVSkillLevels } from '@/engine/fittings/pilotProfile';
import { loadSkills } from '@/sde/loadSde';

/**
 * Changes to the open Fitting (Variations' swap candidates), worked out
 * under exactly what its own stats are. One object per open Fitting, pilot
 * and Damage Profile, so the open Fitting's baseline is worked out once
 * however many variants are compared.
 */
export interface VariantEvaluator {
  /** The open Fitting the variants are changes to. */
  fitting: Fitting;
  /** The pilot the stats run under — skills for fit checks on the candidates. */
  profile: PilotProfile;
  /** A variant's stats beside the open Fitting's own, both without overheat. */
  compare: (variant: Fitting) => Promise<{ before: FittingStats; after: FittingStats }>;
}

/**
 * "What to train" for the open Fitting (`useSkillGains`): the open Fitting
 * with one skill at another level, beside its own stats — the same cached
 * baseline Variations compares against.
 */
export interface SkillGainEvaluator {
  /** The pilot the stats run under; its skill levels are the ones a +1 builds on. */
  profile: PilotProfile;
  /** Every skill that modifies anything on the Fitting, found with every skill at V. */
  skillSources: () => Promise<number[]>;
  /** The Fitting's stats with `skillTypeId` at `level`, beside its own, both without overheat. */
  compare: (
    skillTypeId: number,
    level: number
  ) => Promise<{ before: FittingStats; after: FittingStats }>;
}

export interface FittingEvaluationInput {
  fitting: Fitting | null;
  /** The pilot's own skills and clone; null while loading. */
  profile: PilotProfile | null;
  /** "My clone" vs "Fitting's", already resolved for this Fitting. */
  implantBasis: ImplantBasis;
}

export interface FittingEvaluation {
  /**
   * The latest stats. After an edit to the same hull these are the previous
   * fit's until the new calculation lands, so the bars don't blank on every
   * click — `statsFitting` says which Fitting they belong to. A different
   * hull drops them at once.
   */
  stats: FittingStats | null;
  statsFitting: Fitting | null;
  /** The Abyssal weather `stats` were worked out in (null: normal space) — which lags a new pick until it lands. */
  statsWeatherTypeId: number | null;
  statsProgress: DogmaAssetProgress | null;
  statsError: boolean;
  /** Calculates again after `statsError` — the engine refetches its assets if those failed. */
  retry: () => void;
  /** The ship data (dogma engine) is loaded, so slot and fit checks can run. */
  engineReady: boolean;
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
  /** "What to train"; null until the pilot, the Damage Profile and the engine are ready. */
  skillGains: SkillGainEvaluator | null;
}

/**
 * What a Fitting is worked out under, beside the Fitting itself: the pilot
 * (skills, and the implants the basis picked), the Damage Profile and the
 * session's conditions. One object, so every calculation below takes the
 * same three together and none can forget one.
 */
interface EvaluationBasis {
  pilot: PilotProfile;
  /** Absent: the engine's uniform default. */
  damageProfile?: DamageProfile;
  conditions: StatsConditions;
}

/**
 * Runs `calculate` with the basis's pilot under its skill overrides and the
 * engine options its conditions ask for. `pilotUnder` is awaited only when
 * it hands back a Promise (All V loads the skill list): otherwise `calculate`
 * starts in the same tick, as it did before overrides existed.
 */
async function underBasis<T>(
  { pilot, conditions }: EvaluationBasis,
  calculate: (pilot: PilotProfile, options: StatsOptions) => Promise<T>
): Promise<T> {
  const under = pilotUnder(pilot, conditions);
  return calculate(under instanceof Promise ? await under : under, statsOptions(conditions));
}

/** `fitting`'s stats under `basis`; `extra` adds engine options (no overheat) or a progress callback. */
function statsUnder(
  fitting: Fitting,
  basis: EvaluationBasis,
  extra: { overheated?: boolean; onProgress?: (progress: DogmaAssetProgress) => void } = {}
): Promise<FittingStats> {
  return underBasis(basis, (pilot, options) =>
    computeFittingStats(fitting, pilot, extra.onProgress, basis.damageProfile, {
      ...(extra.overheated === undefined ? {} : { overheated: extra.overheated }),
      ...options,
    })
  );
}

/** `fitting`'s own stats without overheat, worked out once on first ask and shared by every compare. */
function sharedBaseline(fitting: Fitting, basis: EvaluationBasis): () => Promise<FittingStats> {
  // Dropped on failure so a transient error doesn't wedge every later compare.
  let baseline: Promise<FittingStats> | null = null;
  return () => {
    if (baseline === null) {
      const pending = statsUnder(fitting, basis, { overheated: false });
      baseline = pending;
      pending.catch(() => {
        if (baseline === pending) baseline = null;
      });
    }
    return baseline;
  };
}

function variantEvaluator(
  fitting: Fitting,
  basis: EvaluationBasis,
  baseline: () => Promise<FittingStats>
): VariantEvaluator {
  return {
    fitting,
    profile: basis.pilot,
    async compare(variant) {
      const [before, after] = await Promise.all([
        baseline(),
        statsUnder(variant, basis, { overheated: false }),
      ]);
      return { before, after };
    },
  };
}

function skillGainEvaluator(
  fitting: Fitting,
  basis: EvaluationBasis,
  baseline: () => Promise<FittingStats>
): SkillGainEvaluator {
  return {
    profile: basis.pilot,
    async skillSources() {
      // At V, so an untrained skill — which the engine gives no modifiers —
      // is still found when it would change something.
      const all = await loadSkills();
      const pilot = {
        ...basis.pilot,
        skillLevels: allVSkillLevels(all.map((skill) => skill.typeID)),
      };
      return fittingSkillSources(
        fitting,
        pilot,
        basis.damageProfile,
        statsOptions(basis.conditions)
      );
    },
    async compare(skillTypeId, level) {
      const skills = withSkillLevel(
        basis.conditions.skills ?? NO_SKILL_OVERRIDES,
        skillTypeId,
        level
      );
      const [before, after] = await Promise.all([
        baseline(),
        statsUnder(
          fitting,
          { ...basis, conditions: { ...basis.conditions, skills } },
          { overheated: false }
        ),
      ]);
      return { before, after };
    },
  };
}

/**
 * A Fitting other than the open one (Fitting Compare, the applied-DPS
 * overlay), on the basis it would open on: its own carried set when it
 * carries one, else the pilot's clone — under the same conditions as the
 * open one (`useStatsConditions`, passed in so a caller re-runs when they change).
 */
export function evaluateFitting(
  fitting: Fitting,
  profile: PilotProfile,
  damageProfile: DamageProfile | undefined,
  conditions: StatsConditions
): Promise<FittingStats> {
  const pilot = applyImplantBasis(profile, fitting.implantSet, defaultImplantBasis(fitting));
  return statsUnder(fitting, {
    pilot,
    conditions,
    ...(damageProfile === undefined ? {} : { damageProfile }),
  });
}

/**
 * `fitting` with `implants` in place of its own carried implants (boosters
 * kept), without overheat — the implant finder's "what would this implant
 * do" run. Always on the Fitting's own set, since that is what the finder
 * adds to, whichever basis the page shows.
 */
export function evaluateImplantSet(
  fitting: Fitting,
  profile: PilotProfile,
  damageProfile: DamageProfile | undefined,
  conditions: StatsConditions,
  implants: readonly number[]
): Promise<FittingStats> {
  const pilot = applyImplantBasis(
    profile,
    { ...(fitting.implantSet ?? { boosters: [] }), implants: [...implants] },
    'fitting'
  );
  return statsUnder(
    fitting,
    { pilot, conditions, ...(damageProfile === undefined ? {} : { damageProfile }) },
    { overheated: false }
  );
}

/** The open Fitting's stats, price and Variations evaluator. */
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
  const [engineReady, setEngineReady] = useState(isDogmaEngineReady);
  const [price, setPrice] = useState<Appraisal | null>(null);

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
    setPrice(null);
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
        setEngineReady(true);
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
  const hubHydrated = useMarketHub((state) => state.hydrated);
  const hydrateHub = useMarketHub((state) => state.hydrate);
  useEffect(() => {
    void hydrateHub();
  }, [hydrateHub]);

  useEffect(() => {
    let cancelled = false;
    if (fitting === null || !hubHydrated) return;
    void (async () => {
      const result = await loadFittingPrice(fitting, getTradeHub(hubId) ?? DEFAULT_TRADE_HUB);
      if (!cancelled) setPrice(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [fitting, hubId, hubHydrated]);

  // One baseline for Variations and "What to train" alike.
  const evaluators = useMemo(() => {
    if (fitting === null || pilot === null || damageProfile === null || !engineReady) return null;
    const basis = { pilot, damageProfile, conditions };
    const baseline = sharedBaseline(fitting, basis);
    return {
      variants: variantEvaluator(fitting, basis, baseline),
      skillGains: skillGainEvaluator(fitting, basis, baseline),
    };
  }, [fitting, pilot, damageProfile, conditions, engineReady]);

  const explain = useMemo(
    () =>
      fitting === null || pilot === null || damageProfile === null || !engineReady
        ? null
        : (moduleIndex: number) =>
            underBasis({ pilot, damageProfile, conditions }, (under, options) =>
              explainModule(fitting, under, moduleIndex, damageProfile, options)
            ),
    [fitting, pilot, damageProfile, conditions, engineReady]
  );

  return {
    stats: stats?.stats ?? null,
    statsFitting: stats?.fitting ?? null,
    statsWeatherTypeId: stats?.weatherTypeId ?? null,
    statsProgress,
    statsError,
    retry,
    engineReady,
    damageProfiles,
    price,
    variants: evaluators?.variants ?? null,
    explainModule: explain,
    skillGains: evaluators?.skillGains ?? null,
  };
}
