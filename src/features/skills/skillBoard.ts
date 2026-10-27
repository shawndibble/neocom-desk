/**
 * The Skills › Trained board: every skill in the SDE, grouped, with the
 * character's trained level, queued level and whether its book is missing.
 * Pure — the route hands in the catalog, the corrected trained levels and the
 * queue; nothing here reads a clock or storage.
 */
import type { SkillType } from '@/sde/types';
import { stripEveMarkup } from './typeDisplay';
import type { SkillGroup } from './skillsCsv';

export interface BoardSkill {
  skillTypeID: number;
  name: string;
  rank: number;
  /** 0 when untrained or not injected. */
  level: number;
  /** Null when not injected, or when ESI withheld it. */
  sp: number | null;
  /** In the character's ESI skills at all. False means the skill book is still needed. */
  injected: boolean;
  /** The highest level waiting in the queue, only when above `level`. */
  queuedLevel: number | null;
  /** Markup-stripped description, for the row's tooltip. */
  description: string | null;
}

export interface BoardGroup {
  groupName: string;
  /** Skills in the group, trained or not. */
  total: number;
  /** Skills at level 1 or higher. */
  trained: number;
  /** Skills with a higher level waiting in the queue. */
  queued: number;
  skills: BoardSkill[];
}

export interface BuildSkillBoardInput {
  catalog: readonly SkillType[];
  /** Corrected trained levels (ESI plus finished queue entries), keyed by skill. */
  trained: ReadonlyMap<number, { level: number; sp: number | null }>;
  /** `queuedLevelsBySkill`'s output. */
  queuedLevels: ReadonlyMap<number, number>;
  /** Group for trained skills the SDE does not know. */
  unknownGroupName: string;
}

function toGroup(groupName: string, skills: BoardSkill[]): BoardGroup {
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return {
    groupName,
    total: skills.length,
    trained: skills.filter((s) => s.level >= 1).length,
    queued: skills.filter((s) => s.queuedLevel !== null).length,
    skills,
  };
}

export function buildSkillBoard({
  catalog,
  trained,
  queuedLevels,
  unknownGroupName,
}: BuildSkillBoardInput): BoardGroup[] {
  const toBoardSkill = (skillTypeID: number, info: SkillType | undefined): BoardSkill => {
    const mine = trained.get(skillTypeID);
    const level = mine?.level ?? 0;
    const queued = queuedLevels.get(skillTypeID);
    return {
      skillTypeID,
      name: info?.name ?? `#${skillTypeID}`,
      rank: info?.rank ?? 1,
      level,
      sp: mine?.sp ?? null,
      injected: mine !== undefined,
      queuedLevel: queued !== undefined && queued > level ? queued : null,
      description: info?.description ? stripEveMarkup(info.description) : null,
    };
  };

  const byGroup = new Map<string, SkillType[]>();
  for (const info of catalog) {
    const list = byGroup.get(info.groupName) ?? [];
    list.push(info);
    byGroup.set(info.groupName, list);
  }
  const groups = [...byGroup.entries()].map(([groupName, infos]) =>
    toGroup(
      groupName,
      infos.map((info) => toBoardSkill(info.typeID, info))
    )
  );

  const known = new Set(catalog.map((info) => info.typeID));
  const strays = [...trained.keys()]
    .filter((id) => !known.has(id))
    .map((id) => toBoardSkill(id, undefined));
  if (strays.length > 0) groups.push(toGroup(unknownGroupName, strays));

  return groups.sort((a, b) => a.groupName.localeCompare(b.groupName));
}

/** The board's trained skills in the CSV's `SkillGroup` shape; groups with none are dropped. */
export function boardCsvGroups(groups: readonly BoardGroup[]): SkillGroup[] {
  return groups
    .map((group) => ({
      groupName: group.groupName,
      skills: group.skills
        .filter((skill) => skill.injected)
        .map((skill) => ({
          skillTypeID: skill.skillTypeID,
          name: skill.name,
          level: skill.level,
          sp: skill.sp,
          description: skill.description,
          rank: skill.rank,
        })),
    }))
    .filter((group) => group.skills.length > 0);
}
