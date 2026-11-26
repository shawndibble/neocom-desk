import type { SkillType } from '@/sde/types';
import { stripEveMarkup } from './typeDisplay';
import type { SkillGroup } from './skillsCsv';

export interface BoardSkill {
  skillTypeID: number;
  name: string;
  rank: number;
  level: number;
  sp: number | null;
  injected: boolean;
  queuedLevel: number | null;
  description: string | null;
}

export interface BoardGroup {
  groupName: string;
  total: number;
  trained: number;
  queued: number;
  skills: BoardSkill[];
}

export interface BuildSkillBoardInput {
  catalog: readonly SkillType[];
  trained: ReadonlyMap<number, { level: number; sp: number | null }>;
  queuedLevels: ReadonlyMap<number, number>;
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

export function boardCsvGroups(
  groups: readonly BoardGroup[],
  plannedLevels: ReadonlyMap<number, number> = new Map()
): SkillGroup[] {
  return groups
    .map((group) => ({
      groupName: group.groupName,
      skills: group.skills.map((skill) => ({
        skillTypeID: skill.skillTypeID,
        name: skill.name,
        level: skill.level,
        sp: skill.sp,
        description: skill.description,
        rank: skill.rank,
        injected: skill.injected,
        queuedLevel: skill.queuedLevel,
        plannedLevel: plannedLevels.get(skill.skillTypeID) ?? null,
      })),
    }))
    .filter((group) => group.skills.length > 0);
}
