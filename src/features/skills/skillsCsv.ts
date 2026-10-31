import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { exportFlag } from '@/lib/exportFlag';

/** Trained skills of one SDE group, as /skills builds them for display and export. */
export interface SkillGroup {
  groupName: string;
  /** `sp` is null when ESI withheld it: a queue entry credited the level but carried no level_end_sp. */
  skills: {
    skillTypeID: number;
    name: string;
    level: number;
    sp: number | null;
    /** Markup-stripped skill description, for the row's tooltip. Null/absent when the skill has none. */
    description?: string | null;
    /** Training time multiplier; also feeds SkillBar's progress-toward-next-level segment (#405). */
    rank: number;
    /** In the character's ESI skills at all; false is a skill book still to inject. */
    injected: boolean;
    /** The highest level waiting in the queue, only when above `level`. */
    queuedLevel: number | null;
    /** The highest level any Skill Plan of this Character asks for; null when no plan lists the skill. */
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

/** One row per skill (injected or not), preserving the incoming group order and within-group order. */
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
