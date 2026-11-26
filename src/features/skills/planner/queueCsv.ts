import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { EngineSkill, PlanMilestone, ScheduledStep, TrainedSkill } from '@/engine/types';
import { milestoneKey } from '@/engine/skills/skillPlanMilestones';
import { stepKey, type SkillPlanSchedule } from '@/engine/skills/skillPlanSchedule';
import { stepFinish } from '@/lib/duration';
import { exportFlag } from '@/lib/exportFlag';
import { isoTime, joined } from '@/lib/exportSheets';
import { priorityLabelKey } from './entryList/rowChrome';
import type { MergedRow, PinnedInProgressEntry } from './queueRows';

export type QueueEntryStatus =
  'scheduled' | 'trained' | 'unknown' | 'queued' | 'training' | 'unscheduled' | 'orphanMilestone';

export interface QueueCsvRow {
  status: QueueEntryStatus;
  skillTypeID: number;
  level: number;
  stepIndex?: number;
  remainingSeconds?: number;
  doneByMs?: number;
  milestone?: string;
}

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
      value: (row) =>
        row.stepIndex === undefined ? null : exportFlag(t, !userSkillTypeIDs.has(row.skillTypeID)),
    },
  ];
}
