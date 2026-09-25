/**
 * Fitting evaluation: what the dogma engine sees for a Fitting and a pilot,
 * and the numbers that come back. Every stats caller goes through here —
 * the editor (`useFittingWorkspace`), the logged-out Share Link view, the
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
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { useDamageProfiles, type DamageProfiles } from './damageProfiles';
import {
  computeFittingStats,
  isDogmaEngineReady,
  type DogmaAssetProgress,
} from './dogmaFittingEngine';
import { loadFittingPrice } from './fittingPrice';

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
}

function withoutOverheat(
  fitting: Fitting,
  pilot: PilotProfile,
  damageProfile: DamageProfile
): Promise<FittingStats> {
  return computeFittingStats(fitting, pilot, undefined, damageProfile, { overheated: false });
}

function variantEvaluator(
  fitting: Fitting,
  pilot: PilotProfile,
  damageProfile: DamageProfile
): VariantEvaluator {
  // Dropped on failure so a transient error doesn't wedge every later compare.
  let baseline: Promise<FittingStats> | null = null;
  return {
    fitting,
    profile: pilot,
    async compare(variant) {
      if (baseline === null) {
        const pending = withoutOverheat(fitting, pilot, damageProfile);
        baseline = pending;
        pending.catch(() => {
          if (baseline === pending) baseline = null;
        });
      }
      const [before, after] = await Promise.all([
        baseline,
        withoutOverheat(variant, pilot, damageProfile),
      ]);
      return { before, after };
    },
  };
}

/**
 * A Fitting other than the open one (Fitting Compare, the applied-DPS
 * overlay), on the basis it would open on: its own carried set when it
 * carries one, else the pilot's clone.
 */
export function evaluateFitting(
  fitting: Fitting,
  profile: PilotProfile,
  damageProfile: DamageProfile | undefined
): Promise<FittingStats> {
  const pilot = applyImplantBasis(profile, fitting.implantSet, defaultImplantBasis(fitting));
  return computeFittingStats(fitting, pilot, undefined, damageProfile);
}

/** The open Fitting's stats, price and Variations evaluator. */
export function useFittingEvaluation({
  fitting,
  profile,
  implantBasis,
}: FittingEvaluationInput): FittingEvaluation {
  const damageProfiles = useDamageProfiles();
  const damageProfile = damageProfiles.hydrated ? damageProfiles.selected : null;

  // Keyed on the carried set, not the Fitting: an edit that leaves the set
  // alone keeps this object, and with it `variants` and its baseline.
  const implantSet = fitting?.implantSet;
  const pilot = useMemo(
    () => (profile === null ? null : applyImplantBasis(profile, implantSet, implantBasis)),
    [profile, implantSet, implantBasis]
  );

  const [stats, setStats] = useState<{ fitting: Fitting; stats: FittingStats } | null>(null);
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
        const result = await computeFittingStats(
          fitting,
          pilot,
          (progress) => {
            if (!cancelled) setStatsProgress(progress);
          },
          damageProfile
        );
        if (cancelled) return;
        setEngineReady(true);
        setStats({ fitting, stats: result });
      } catch {
        if (!cancelled) setStatsError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fitting, pilot, damageProfile, attempt]);

  useEffect(() => {
    let cancelled = false;
    if (fitting === null) return;
    void (async () => {
      const result = await loadFittingPrice(fitting, DEFAULT_TRADE_HUB);
      if (!cancelled) setPrice(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [fitting]);

  const variants = useMemo(
    () =>
      fitting === null || pilot === null || damageProfile === null || !engineReady
        ? null
        : variantEvaluator(fitting, pilot, damageProfile),
    [fitting, pilot, damageProfile, engineReady]
  );

  return {
    stats: stats?.stats ?? null,
    statsFitting: stats?.fitting ?? null,
    statsProgress,
    statsError,
    retry,
    engineReady,
    damageProfiles,
    price,
    variants,
  };
}
