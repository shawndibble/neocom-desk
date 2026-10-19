/**
 * Merges a ship's Mastery tiers with an optional attached fit into one row
 * per skill, each tagged by which source(s) named it. Status/time math is
 * `buildFitCheckRows`'s, unchanged — this only merges entries and
 * re-attaches provenance.
 */
import type { PlanEntry } from '@/engine/types';
import type { SkillPrereq } from '@/sde/types';
import type { FitCheckRow } from './fitCheckRows';

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
 * `masteryTiers`: a ship's 5 tier bundles (`masteries.json`'s own shape),
 * all-empty when there's none. Each bundle is cumulative — tier V's includes
 * every skill named by tiers I-IV, often unchanged — so a skill's tag is the
 * *earliest* tier at which it first reaches its max level across all tiers,
 * not the last tier it happens to appear in (that degenerates to tier V for
 * almost every skill). `fitEntries`: `null` when no fit is attached. A skill
 * named by more than one source takes the max target level across them.
 */
export function mergeShipEntries(
  masteryTiers: readonly (readonly SkillPrereq[])[],
  fitEntries: readonly PlanEntry[] | null
): MergedShipEntries {
  const highestMasteryTier = new Map<number, number>();
  const levelBySkill = new Map<number, number>();

  masteryTiers.forEach((bundle) => {
    for (const { skillTypeID, level } of bundle) {
      levelBySkill.set(skillTypeID, Math.max(levelBySkill.get(skillTypeID) ?? 0, level));
    }
  });

  masteryTiers.forEach((bundle, tier) => {
    for (const { skillTypeID, level } of bundle) {
      if (level === levelBySkill.get(skillTypeID) && !highestMasteryTier.has(skillTypeID)) {
        highestMasteryTier.set(skillTypeID, tier);
      }
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

/**
 * Groups the Ships view by Mastery tier (I first, fit-only rows last),
 * training time ascending within a tier. `1e10` comfortably exceeds any
 * real skill's training seconds, so it never lets a later tier's row sort
 * ahead of an earlier tier's. Trained rows sink last (`sortRows`'s rule for
 * an `undefined` sort value), same as before this view grouped by tier.
 */
export function masteryRowSortValue(
  row: Pick<UnifiedShipRow, 'status' | 'seconds' | 'highestMasteryTier'>
): number | undefined {
  if (row.status === 'trained') return undefined;
  const tier = row.highestMasteryTier ?? 5;
  return tier * 1e10 + row.seconds;
}
