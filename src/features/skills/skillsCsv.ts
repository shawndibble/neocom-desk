import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { exportFlag } from '@/lib/exportFlag';

export interface SkillGroup {
  groupName: string;
  skills: {
    skillTypeID: number;
    name: string;
    level: number;
    sp: number | null;
    description?: string | null;
    rank: number;
    injected: boolean;
    queuedLevel: number | null;
    plannedLevel: number | null;
  }[];
}

export interface SkillCsvRow {
  groupName: string;
  name: string;
  level: number;
  sp: number | null;
  skillTypeId: number;
  rank: number;
  injected: boolean;
  queuedLevel: number | null;
  plannedLevel: number | null;
  description: string;
}

export function skillCsvRows(groups: readonly SkillGroup[]): SkillCsvRow[] {
  return groups.flatMap((group) =>
    group.skills.map((skill) => ({
      groupName: group.groupName,
      name: skill.name,
      level: skill.level,
      sp: skill.sp,
      skillTypeId: skill.skillTypeID,
      rank: skill.rank,
      injected: skill.injected,
      queuedLevel: skill.queuedLevel,
      plannedLevel: skill.plannedLevel,
      description: skill.description ?? '',
    }))
  );
}

export function skillCsvColumns(t: CsvTranslate): CsvColumn<SkillCsvRow>[] {
  return [
    { header: t('skills.csvGroup'), value: (row) => row.groupName },
    { header: t('skills.csvSkill'), value: (row) => row.name },
    { header: t('skills.csvLevel'), value: (row) => row.level },
    { header: t('skills.csvSp'), value: (row) => row.sp },
    { header: t('skills.csvRank'), value: (row) => row.rank },
    {
      header: t('skills.csvInjected'),
      value: (row) => exportFlag(t, row.injected),
    },
    { header: t('skills.csvQueuedLevel'), value: (row) => row.queuedLevel },
    { header: t('skills.csvPlannedLevel'), value: (row) => row.plannedLevel },
    { header: t('skills.csvTypeId'), value: (row) => row.skillTypeId },
    { header: t('skills.csvDescription'), value: (row) => row.description },
  ];
}
