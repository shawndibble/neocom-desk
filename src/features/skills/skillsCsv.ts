import type { CsvColumn } from '@/lib/csv';

export interface SkillGroupLike {
  groupName: string;
  skills: { skillTypeID: number; name: string; level: number; sp: number }[];
}

export interface SkillCsvRow {
  groupName: string;
  name: string;
  level: number;
  sp: number;
}

type Translate = (key: string) => string;

/** One row per skill, preserving the incoming group order and within-group order. */
export function skillCsvRows(groups: readonly SkillGroupLike[]): SkillCsvRow[] {
  return groups.flatMap((group) =>
    group.skills.map((skill) => ({
      groupName: group.groupName,
      name: skill.name,
      level: skill.level,
      sp: skill.sp,
    }))
  );
}

export function skillCsvColumns(t: Translate): CsvColumn<SkillCsvRow>[] {
  return [
    { header: t('skills.csvGroup'), value: (row) => row.groupName },
    { header: t('skills.csvSkill'), value: (row) => row.name },
    { header: t('skills.csvLevel'), value: (row) => row.level },
    { header: t('skills.csvSp'), value: (row) => row.sp },
  ];
}
