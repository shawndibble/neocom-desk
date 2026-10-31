import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { EngineSkill, PlanEntry, ScheduledStep, TrainedSkill } from '@/engine/types';
import type { SkillPlanSchedule } from '@/engine/skills/skillPlanSchedule';
import { stepFinish } from '@/lib/duration';
import { priorityLabelKey } from './entryList/rowChrome';

/** Why a plan entry has no scheduled time of its own. */
export type QueueEntryStatus = 'scheduled' | 'trained' | 'unknown' | 'queued';

/**
 * One exported plan row: a scheduled training step, or a plan entry the
 * schedule leaves out (already trained, ahead of the plan in the live queue,
 * or a skill this SDE snapshot does not know), so the file lists every entry
 * the plan holds.
 */
export interface QueueCsvRow {
  status: QueueEntryStatus;
  skillTypeID: number;
  level: number;
  /** Present for `scheduled` only. */
  step?: ScheduledStep;
  /** The step's index in the schedule, for the marker, Booster and Alpha lookups. */
  stepIndex?: number;
}

/** What the rows are read against: the costed schedule and the plan's own entries. */
export interface QueueCsvContext {
  schedule: Pick<
    SkillPlanSchedule,
    | 'scheduled'
    | 'startDate'
    | 'markerStepIndices'
    | 'boostedSteps'
    | 'alphaCappedSteps'
    | 'priorityMap'
  >;
  engineSkills: ReadonlyMap<number, EngineSkill>;
}

/**
 * The scheduled steps in training order, then the plan entries that have none:
 * already trained, ahead of the plan in the live queue, or unknown to the catalog.
 */
export function queueCsvRows(
  schedule: Pick<SkillPlanSchedule, 'scheduled' | 'isKnownSkill'>,
  entries: readonly PlanEntry[],
  trainedSkills: ReadonlyMap<number, TrainedSkill>
): QueueCsvRow[] {
  const rows: QueueCsvRow[] = schedule.scheduled.map((step, stepIndex) => ({
    status: 'scheduled',
    skillTypeID: step.skillTypeID,
    level: step.level,
    step,
    stepIndex,
  }));
  const scheduledLevels = new Set(schedule.scheduled.map((s) => `${s.skillTypeID}:${s.level}`));
  for (const entry of entries) {
    const base = { skillTypeID: entry.skillTypeID, level: entry.targetLevel };
    if (!schedule.isKnownSkill(entry.skillTypeID)) {
      rows.push({ ...base, status: 'unknown' });
    } else if (scheduledLevels.has(`${entry.skillTypeID}:${entry.targetLevel}`)) {
      continue;
    } else if ((trainedSkills.get(entry.skillTypeID)?.level ?? 0) >= entry.targetLevel) {
      rows.push({ ...base, status: 'trained' });
    } else {
      rows.push({ ...base, status: 'queued' });
    }
  }
  return rows;
}

const STATUS_KEY: Record<QueueEntryStatus, string> = {
  scheduled: 'plans.csvStatusScheduled',
  trained: 'plans.csvStatusTrained',
  unknown: 'plans.csvStatusUnknown',
  queued: 'plans.csvStatusQueued',
};

/**
 * CSV columns for the computed training queue. Level/seconds/cumulative
 * seconds are raw numbers, not the roman numeral or formatDuration() strings
 * ComputedQueue.tsx renders for display — the CSV needs to support
 * spreadsheet math. Start and done-by are the instants the step begins and
 * ends on the plan's own clock, as ISO strings.
 */
export function queueCsvColumns(
  t: CsvTranslate,
  nameFor: (skillTypeID: number) => string,
  userSkillTypeIDs: ReadonlySet<number>,
  { schedule, engineSkills }: QueueCsvContext
): CsvColumn<QueueCsvRow>[] {
  const yesNo = (flag: boolean) => t(flag ? 'plans.csvYes' : 'plans.csvNo');
  const stepOnly =
    <V>(read: (step: ScheduledStep, stepIndex: number) => V) =>
    (row: QueueCsvRow) =>
      row.step === undefined || row.stepIndex === undefined
        ? undefined
        : read(row.step, row.stepIndex);
  return [
    { header: t('plans.csvSkill'), value: (row) => nameFor(row.skillTypeID) },
    { header: t('plans.csvLevel'), value: (row) => row.level },
    { header: t('plans.csvStatus'), value: (row) => t(STATUS_KEY[row.status]) },
    { header: t('plans.csvSeconds'), value: stepOnly((step) => step.seconds) },
    { header: t('plans.csvCumulativeSeconds'), value: stepOnly((step) => step.cumulativeSeconds) },
    {
      header: t('plans.csvStart'),
      value: stepOnly((step) =>
        stepFinish(step.cumulativeSeconds - step.seconds, schedule.startDate).toISOString()
      ),
    },
    {
      header: t('plans.csvDoneBy'),
      value: stepOnly((step) =>
        stepFinish(step.cumulativeSeconds, schedule.startDate).toISOString()
      ),
    },
    { header: t('plans.csvSp'), value: stepOnly((step) => step.sp) },
    {
      header: t('plans.csvPriority'),
      value: (row) => {
        const priority = schedule.priorityMap.get(row.skillTypeID);
        return priority === undefined || row.status === 'unknown'
          ? undefined
          : t(priorityLabelKey(priority));
      },
    },
    {
      header: t('plans.csvPrimaryAttribute'),
      value: (row) => {
        const skill = engineSkills.get(row.skillTypeID);
        return skill ? t(`skills.attr.${skill.primary}`) : undefined;
      },
    },
    {
      header: t('plans.csvSecondaryAttribute'),
      value: (row) => {
        const skill = engineSkills.get(row.skillTypeID);
        return skill ? t(`skills.attr.${skill.secondary}`) : undefined;
      },
    },
    {
      header: t('plans.csvBoosted'),
      value: stepOnly((_, i) => yesNo(schedule.boostedSteps.has(i))),
    },
    {
      header: t('plans.csvAlphaCapped'),
      value: stepOnly((_, i) => yesNo(schedule.alphaCappedSteps.has(i))),
    },
    {
      header: t('plans.csvRemapBefore'),
      value: stepOnly((_, i) => yesNo(schedule.markerStepIndices.includes(i))),
    },
    {
      header: t('plans.csvPrereq'),
      // A step whose skillTypeID isn't in userSkillTypeIDs was inserted by
      // the planner as a prerequisite (mirrors ComputedQueue.tsx's isPrereq).
      value: stepOnly((step) => yesNo(!userSkillTypeIDs.has(step.skillTypeID))),
    },
  ];
}
