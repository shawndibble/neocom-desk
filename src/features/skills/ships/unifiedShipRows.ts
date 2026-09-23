/**
 * Merges a ship's Mastery tiers with an optional attached fit into one row
 * per skill, each tagged by which source(s) named it. Built on
 * `buildFitCheckRows` for the actual status/time math — this only merges
 * entries and re-attaches provenance.
 */
import type { EngineSkill, PlanEntry, ScheduledStep, TrainedSkill } from '@/engine/types';
import type { SkillPrereq } from '@/sde/types';
import { buildFitCheckRows, type FitCheckRow } from './fitCheckRows';

export interface UnifiedShipRow extends FitCheckRow {
  /** Highest Mastery tier (0-4) that requires this skill, or null if none does. */
  highestMasteryTier: number | null;
  fromFit: boolean;
}

export interface MergedShipEntries {
  entries: PlanEntry[];
  highestMasteryTier: Map<number, number>;
  fromFit: Set<number>;
}

/**
 * `masteryTiers` is a ship's 5 tier bundles (index 0-4, `masteries.json`'s
 * own shape) — all-empty for a hull with no mastery data, or when the ship
 * search hasn't resolved one yet. `fitEntries` is `null` when no fit is
 * attached.
 *
 * Same skill in more than one tier, or in both a tier and the fit: takes the
 * max target level across every source that names it. A skill's own level is
 * assumed non-decreasing tier to tier, per CCP's own Mastery design (not
 * enforced here) — so the highest tier requiring a skill is also its
 * binding tag, even though the max-level computation itself doesn't rely on
 * that assumption.
 */
export function mergeShipEntries(
  masteryTiers: readonly (readonly SkillPrereq[])[],
  fitEntries: readonly PlanEntry[] | null
): MergedShipEntries {
  const highestMasteryTier = new Map<number, number>();
  const levelBySkill = new Map<number, number>();

  masteryTiers.forEach((bundle, tier) => {
    for (const { skillTypeID, level } of bundle) {
      highestMasteryTier.set(skillTypeID, tier);
      levelBySkill.set(skillTypeID, Math.max(levelBySkill.get(skillTypeID) ?? 0, level));
    }
  });

  const fromFit = new Set<number>();
  for (const { skillTypeID, targetLevel } of fitEntries ?? []) {
    fromFit.add(skillTypeID);
    levelBySkill.set(skillTypeID, Math.max(levelBySkill.get(skillTypeID) ?? 0, targetLevel));
  }

  const entries: PlanEntry[] = Array.from(levelBySkill, ([skillTypeID, targetLevel]) => ({
    skillTypeID,
    targetLevel,
  }));

  return { entries, highestMasteryTier, fromFit };
}

/** Re-attaches each row's provenance by `skillTypeID` — pure, no recomputation. */
export function tagUnifiedRows(
  rows: readonly FitCheckRow[],
  highestMasteryTier: ReadonlyMap<number, number>,
  fromFit: ReadonlySet<number>
): UnifiedShipRow[] {
  return rows.map((row) => ({
    ...row,
    highestMasteryTier: highestMasteryTier.get(row.skillTypeID) ?? null,
    fromFit: fromFit.has(row.skillTypeID),
  }));
}

/** Convenience wrapper for callers that already have a computed schedule. */
export function buildUnifiedShipRows(
  masteryTiers: readonly (readonly SkillPrereq[])[],
  fitEntries: readonly PlanEntry[] | null,
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill>,
  scheduled: readonly ScheduledStep[]
): UnifiedShipRow[] {
  const { entries, highestMasteryTier, fromFit } = mergeShipEntries(masteryTiers, fitEntries);
  const rows = buildFitCheckRows(entries, skills, trainedSkills, scheduled);
  return tagUnifiedRows(rows, highestMasteryTier, fromFit);
}
