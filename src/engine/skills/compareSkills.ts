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
    for (const characterId of characterIds) {
      const level = skillsByCharacter.get(characterId)?.get(skillTypeID)?.level ?? 0;
      levels.set(characterId, level);
    }
    rows.push({
      skillTypeID,
      name: info?.name ?? `#${skillTypeID}`,
      groupName: info?.groupName ?? '',
      levels,
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

/** How one character's level of a skill stands against the baseline character's. */
export type LevelDelta =
  | { kind: 'same' }
  | { kind: 'ahead'; by: number }
  | { kind: 'behind'; by: number }
  | { kind: 'missing' };

/**
 * `missing` rather than `behind` when the character has no level at all of a
 * skill the baseline has: "doesn't have it" is a different fact from "is two
 * levels short", and a bare `-4` would hide it.
 */
export function levelDelta(level: number, baselineLevel: number): LevelDelta {
  if (level === baselineLevel) return { kind: 'same' };
  if (level === 0) return { kind: 'missing' };
  if (level > baselineLevel) return { kind: 'ahead', by: level - baselineLevel };
  return { kind: 'behind', by: baselineLevel - level };
}

/** A character's level of a row's skill: 0 for one with none, or for no character at all. */
export function levelOf(row: ComparisonRow, characterId: number | null): number {
  return characterId === null ? 0 : (row.levels.get(characterId) ?? 0);
}

/** Rows whose levels differ across the compared characters, and the rest — kept so they can be shown on demand. */
export function splitDiffering(rows: readonly ComparisonRow[]): {
  differing: ComparisonRow[];
  identical: ComparisonRow[];
} {
  const differing: ComparisonRow[] = [];
  const identical: ComparisonRow[] = [];
  for (const row of rows) (hasDifferingLevels(row) ? differing : identical).push(row);
  return { differing, identical };
}

export interface GroupBand {
  groupName: string;
  rows: ComparisonRow[];
  /** Per character: total levels across the band's rows minus the baseline's (0 for the baseline). */
  netDelta: ReadonlyMap<number, number>;
}

/** Consecutive rows with the same group name, each with its net lead or deficit against the baseline. */
export function groupBands(
  rows: readonly ComparisonRow[],
  characterIds: readonly number[],
  baselineId: number | null
): GroupBand[] {
  const bands: GroupBand[] = [];
  for (const row of rows) {
    const last = bands.at(-1);
    if (last && last.groupName === row.groupName) last.rows.push(row);
    else bands.push({ groupName: row.groupName, rows: [row], netDelta: new Map() });
  }
  return bands.map((band) => {
    const netDelta = new Map<number, number>();
    for (const characterId of characterIds) {
      let net = 0;
      for (const row of band.rows) net += levelOf(row, characterId) - levelOf(row, baselineId);
      netDelta.set(characterId, characterId === baselineId ? 0 : net);
    }
    return { ...band, netDelta };
  });
}

/**
 * The requested baseline while it is still selected, else the preferred
 * character (the active one) if selected, else the first selected.
 */
export function resolveBaseline(
  selectedIds: readonly number[],
  requested: number | null,
  preferred: number | null = null
): number | null {
  if (requested !== null && selectedIds.includes(requested)) return requested;
  if (preferred !== null && selectedIds.includes(preferred)) return preferred;
  return selectedIds[0] ?? null;
}
