import type { CsvColumn } from '@/lib/csv';
import type { ScheduledStep } from '@/engine/types';

type Translate = (key: string) => string;

/**
 * CSV columns for the computed training queue. Level/seconds/cumulative
 * seconds are raw numbers, not the roman numeral or formatDuration() strings
 * ComputedQueue.tsx renders for display — the CSV needs to support
 * spreadsheet math.
 */
export function queueCsvColumns(
  t: Translate,
  nameFor: (skillTypeID: number) => string,
  userSkillTypeIDs: ReadonlySet<number>
): CsvColumn<ScheduledStep>[] {
  return [
    { header: t('plans.csvSkill'), value: (step) => nameFor(step.skillTypeID) },
    { header: t('plans.csvLevel'), value: (step) => step.level },
    { header: t('plans.csvSeconds'), value: (step) => step.seconds },
    { header: t('plans.csvCumulativeSeconds'), value: (step) => step.cumulativeSeconds },
    {
      header: t('plans.csvPrereq'),
      // A step whose skillTypeID isn't in userSkillTypeIDs was inserted by
      // the planner as a prerequisite (mirrors ComputedQueue.tsx's isPrereq).
      value: (step) =>
        userSkillTypeIDs.has(step.skillTypeID) ? t('plans.csvNo') : t('plans.csvYes'),
    },
  ];
}
