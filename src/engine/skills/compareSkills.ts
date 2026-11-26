import type { TrainedSkill } from '@/engine/types';

export interface SkillDisplayInfo {
  name: string;
  groupName: string;
}

export interface ComparisonRow {
  skillTypeID: number;
  name: string;
  groupName: string;
  levels: ReadonlyMap<number, number>;
}

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

export function hasDifferingLevels(row: ComparisonRow): boolean {
  const levels = [...row.levels.values()];
  return levels.some((level) => level !== levels[0]);
}

export function idsNeedingFetch(
  selectedIds: readonly number[],
  cachedIds: ReadonlySet<number>,
  forceAll: boolean
): number[] {
  if (forceAll) return [...selectedIds];
  return selectedIds.filter((id) => !cachedIds.has(id));
}

export type LevelDelta =
  | { kind: 'same' }
  | { kind: 'ahead'; by: number }
  | { kind: 'behind'; by: number }
  | { kind: 'missing' };

export function levelDelta(level: number, baselineLevel: number): LevelDelta {
  if (level === baselineLevel) return { kind: 'same' };
  if (level === 0) return { kind: 'missing' };
  if (level > baselineLevel) return { kind: 'ahead', by: level - baselineLevel };
  return { kind: 'behind', by: baselineLevel - level };
}

export function levelOf(row: ComparisonRow, characterId: number | null): number {
  return characterId === null ? 0 : (row.levels.get(characterId) ?? 0);
}

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
  netDelta: ReadonlyMap<number, number>;
}

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

export function resolveBaseline(
  selectedIds: readonly number[],
  requested: number | null,
  preferred: number | null = null
): number | null {
  if (requested !== null && selectedIds.includes(requested)) return requested;
  if (preferred !== null && selectedIds.includes(preferred)) return preferred;
  return selectedIds[0] ?? null;
}
