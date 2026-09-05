/**
 * Merges several characters' trained-skill maps into one side-by-side table.
 * Pure: callers apply the stale-skills queue correction (queueStatus.ts)
 * before handing skill maps in here.
 */
import type { TrainedSkill } from '@/engine/types';

export interface SkillDisplayInfo {
  name: string;
  groupName: string;
}

export interface ComparisonRow {
  skillTypeID: number;
  name: string;
  groupName: string;
  /** Trained level per character id; 0 for a character that has not trained this skill. */
  levels: ReadonlyMap<number, number>;
  /** Highest level among the compared characters, for "who's ahead" styling. */
  maxLevel: number;
}

/**
 * One row per skill any compared character has trained. A character with no
 * entry for that skill reads as level 0 rather than being left out of the
 * row — every column needs a value to compare against the others.
 */
export function buildComparisonRows(
  characterIds: readonly number[],
  skillsByCharacter: ReadonlyMap<number, ReadonlyMap<number, TrainedSkill>>,
  bySkillTypeID: ReadonlyMap<number, SkillDisplayInfo>
): ComparisonRow[] {
  const skillTypeIDs = new Set<number>();
  for (const characterId of characterIds) {
    for (const skillTypeID of skillsByCharacter.get(characterId)?.keys() ?? []) {
      skillTypeIDs.add(skillTypeID);
    }
  }

  const rows: ComparisonRow[] = [];
  for (const skillTypeID of skillTypeIDs) {
    const info = bySkillTypeID.get(skillTypeID);
    const levels = new Map<number, number>();
    let maxLevel = 0;
    for (const characterId of characterIds) {
      const level = skillsByCharacter.get(characterId)?.get(skillTypeID)?.level ?? 0;
      levels.set(characterId, level);
      if (level > maxLevel) maxLevel = level;
    }
    rows.push({
      skillTypeID,
      name: info?.name ?? `#${skillTypeID}`,
      groupName: info?.groupName ?? '',
      levels,
      maxLevel,
    });
  }

  return rows.sort(
    (a, b) => a.groupName.localeCompare(b.groupName) || a.name.localeCompare(b.name)
  );
}

/** True when the compared characters' levels are not all equal for this skill. */
export function hasDifferingLevels(row: ComparisonRow): boolean {
  const levels = [...row.levels.values()];
  return levels.some((level) => level !== levels[0]);
}

/**
 * Which selected characters actually need a fetch: everyone, if `forceAll`
 * (a manual refresh), otherwise only those not already in `cachedIds` — a
 * character re-selected, or the active character already warmed at boot,
 * costs nothing extra.
 */
export function idsNeedingFetch(
  selectedIds: readonly number[],
  cachedIds: ReadonlySet<number>,
  forceAll: boolean
): number[] {
  if (forceAll) return [...selectedIds];
  return selectedIds.filter((id) => !cachedIds.has(id));
}
