import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { EngineSkill, PlanMilestone, ScheduledStep, TrainedSkill } from '@/engine/types';
import { milestoneKey } from '@/engine/skills/skillPlanMilestones';
import { stepKey, type SkillPlanSchedule } from '@/engine/skills/skillPlanSchedule';
import { stepFinish } from '@/lib/duration';
import { exportFlag } from '@/lib/exportFlag';
import { isoTime, joined } from '@/lib/exportSheets';
import { priorityLabelKey } from './entryList/rowChrome';
import type { MergedRow, PinnedInProgressEntry } from './queueRows';

/** Why a plan row is listed: a scheduled step, or what keeps its entry out of the schedule. */
export type QueueEntryStatus =
  'scheduled' | 'trained' | 'unknown' | 'queued' | 'training' | 'unscheduled' | 'orphanMilestone';

/**
 * One exported plan row: a scheduled step, or a plan entry with no step of its
 * own, so the file lists every entry the plan holds, in the plan's order. A
 * Plan Milestone with no row to sit on is a row of its own.
 */
export interface QueueCsvRow {
  status: QueueEntryStatus;
  skillTypeID: number;
  level: number;
  /** Index into `schedule.scheduled`; present for `scheduled` only. */
  stepIndex?: number;
  /** The level in training in the live queue: its real time left, and the instant that ends. */
  remainingSeconds?: number;
  doneByMs?: number;
  /** Names of the Plan Milestones anchored at this skill level. */
  milestone?: string;
}

/** What the columns read a row against: the costed schedule and the catalog. */
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
 * The editor's merged rows (each entry's prerequisites ahead of it, markers
 * skipped) as export rows: every scheduled step, plus a status row for an entry
 * with no step of its own. Built when an export runs.
 */
export function queueCsvRows({
  mergedRows,
  schedule,
  trainedSkills,
  pinned,
  nowMs,
  milestones,
}: {
  mergedRows: readonly MergedRow[];
  schedule: Pick<SkillPlanSchedule, 'scheduled' | 'isKnownSkill' | 'error'>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  /** The entry that is the in-game queue's level in training, with its real seconds left. */
  pinned: PinnedInProgressEntry | null;
  nowMs: number;
  milestones: readonly PlanMilestone[];
}): QueueCsvRow[] {
  const { scheduled } = schedule;
  const stepRow = (stepIndex: number): QueueCsvRow => ({
    status: 'scheduled',
    skillTypeID: scheduled[stepIndex].skillTypeID,
    level: scheduled[stepIndex].level,
    stepIndex,
  });
  const scheduledKeys = new Set(scheduled.map(stepKey));
  const rows: QueueCsvRow[] = [];
  for (const merged of mergedRows) {
    if (merged.kind === 'marker') continue;
    if (merged.kind === 'prereq') {
      rows.push(stepRow(merged.stepIndex));
      continue;
    }
    for (const stepIndex of merged.stepIndices) rows.push(stepRow(stepIndex));
    const { entry } = merged;
    if (scheduledKeys.has(stepKey({ skillTypeID: entry.skillTypeID, level: entry.targetLevel }))) {
      continue;
    }
    const base = { skillTypeID: entry.skillTypeID, level: entry.targetLevel };
    if (!schedule.isKnownSkill(entry.skillTypeID)) {
      rows.push({ ...base, status: 'unknown' });
    } else if ((trainedSkills.get(entry.skillTypeID)?.level ?? 0) >= entry.targetLevel) {
      rows.push({ ...base, status: 'trained' });
    } else if (pinned?.id === merged.id) {
      rows.push({
        ...base,
        status: 'training',
        remainingSeconds: pinned.seconds,
        doneByMs: nowMs + pinned.seconds * 1000,
      });
    } else {
      // A plan the normalizer rejected has no schedule at all: say so rather than "queued".
      rows.push({ ...base, status: schedule.error === null ? 'queued' : 'unscheduled' });
    }
  }
  const namesAt = new Map<string, string[]>();
  for (const milestone of milestones) {
    const key = milestoneKey(milestone);
    namesAt.set(key, [...(namesAt.get(key) ?? []), milestone.name]);
  }
  const placed = new Set<string>();
  for (const row of rows) {
    const key = stepKey(row);
    const names = namesAt.get(key);
    if (names) {
      row.milestone = joined(names);
      placed.add(key);
    }
  }
  for (const milestone of milestones) {
    if (placed.has(milestoneKey(milestone))) continue;
    rows.push({
      status: 'orphanMilestone',
      skillTypeID: milestone.skillTypeID,
      level: milestone.level,
      milestone: milestone.name,
    });
  }
  return rows;
}

const STATUS_KEY: Record<QueueEntryStatus, string> = {
  scheduled: 'plans.csvStatusScheduled',
  trained: 'plans.csvStatusTrained',
  unknown: 'plans.csvStatusUnknown',
  queued: 'plans.csvStatusQueued',
  training: 'plans.csvStatusTraining',
  unscheduled: 'plans.csvStatusUnscheduled',
  orphanMilestone: 'plans.csvStatusOrphanMilestone',
};

/**
 * CSV columns for the computed training queue. Level/seconds/cumulative
 * seconds are raw numbers, not the roman numeral or formatDuration() strings
 * the list renders, so the file supports spreadsheet math. Start and done-by
 * are the instants a step begins and ends on the plan's own clock.
 */
export function queueCsvColumns(
  t: CsvTranslate,
  nameFor: (skillTypeID: number) => string,
  userSkillTypeIDs: ReadonlySet<number>,
  { schedule, engineSkills }: QueueCsvContext
): CsvColumn<QueueCsvRow>[] {
  const stepOf = (row: QueueCsvRow): ScheduledStep | undefined =>
    row.stepIndex === undefined ? undefined : schedule.scheduled[row.stepIndex];
  const finishMs = (seconds: number) => stepFinish(seconds, schedule.startDate).getTime();
  return [
    { header: t('plans.csvSkill'), value: (row) => nameFor(row.skillTypeID) },
    { header: t('plans.csvLevel'), value: (row) => row.level },
    { header: t('plans.csvStatus'), value: (row) => t(STATUS_KEY[row.status]) },
    { header: t('plans.csvSeconds'), value: (row) => stepOf(row)?.seconds ?? row.remainingSeconds },
    { header: t('plans.csvCumulativeSeconds'), value: (row) => stepOf(row)?.cumulativeSeconds },
    {
      header: t('plans.csvStart'),
      value: (row) => {
        const step = stepOf(row);
        return step && isoTime(finishMs(step.cumulativeSeconds - step.seconds));
      },
    },
    {
      header: t('plans.csvDoneBy'),
      value: (row) => {
        const step = stepOf(row);
        return step ? isoTime(finishMs(step.cumulativeSeconds)) : isoTime(row.doneByMs);
      },
    },
    { header: t('plans.csvMilestone'), value: (row) => row.milestone },
    { header: t('plans.csvSp'), value: (row) => stepOf(row)?.sp },
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
      value: (row) =>
        row.stepIndex === undefined
          ? null
          : exportFlag(t, schedule.boostedSteps.has(row.stepIndex)),
    },
    {
      header: t('plans.csvAlphaCapped'),
      value: (row) =>
        row.stepIndex === undefined
          ? null
          : exportFlag(t, schedule.alphaCappedSteps.has(row.stepIndex)),
    },
    {
      header: t('plans.csvRemapBefore'),
      value: (row) =>
        row.stepIndex === undefined
          ? null
          : exportFlag(t, schedule.markerStepIndices.includes(row.stepIndex)),
    },
    {
      header: t('plans.csvPrereq'),
      // A step whose skill isn't one the user listed was inserted by the planner as a prerequisite.
      value: (row) =>
        row.stepIndex === undefined ? null : exportFlag(t, !userSkillTypeIDs.has(row.skillTypeID)),
    },
  ];
}
