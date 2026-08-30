import type { CsvColumn, CsvTranslate } from '@/lib/csv';

/** Trained skills of one SDE group, as /skills builds them for display and export. */
export interface SkillGroup {
  groupName: string;
  /** `sp` is null when ESI withheld it: a queue entry credited the level but carried no level_end_sp. */
  skills: { skillTypeID: number; name: string; level: number; sp: number | null }[];
}

export interface SkillCsvRow {
  groupName: string;
  name: string;
  level: number;
  sp: number | null;
}

/** One row per skill, preserving the incoming group order and within-group order. */
export function skillCsvRows(groups: readonly SkillGroup[]): SkillCsvRow[] {
  return groups.flatMap((group) =>
    group.skills.map((skill) => ({
      groupName: group.groupName,
      name: skill.name,
      level: skill.level,
      sp: skill.sp,
    }))
  );
}

export function skillCsvColumns(t: CsvTranslate): CsvColumn<SkillCsvRow>[] {
  return [
    { header: t('skills.csvGroup'), value: (row) => row.groupName },
    { header: t('skills.csvSkill'), value: (row) => row.name },
    { header: t('skills.csvLevel'), value: (row) => row.level },
    { header: t('skills.csvSp'), value: (row) => row.sp ?? '' },
  ];
}
