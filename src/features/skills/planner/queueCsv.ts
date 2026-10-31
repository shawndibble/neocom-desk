import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type {
  EngineSkill,
  PlanEntry,
  PlanMilestone,
  ScheduledStep,
  TrainedSkill,
} from '@/engine/types';
import type { SkillPlanSchedule } from '@/engine/skills/skillPlanSchedule';
import { stepFinish } from '@/lib/duration';
import { priorityLabelKey } from './entryList/rowChrome';
import { entrySlices } from './entrySlices';
import { entryId } from './reorder';
import type { PinnedInProgressEntry } from './queueRows';

/** Why a plan row is listed: a scheduled step, or what keeps its entry out of the schedule. */
export type QueueEntryStatus =
  'scheduled' | 'trained' | 'unknown' | 'queued' | 'training' | 'unscheduled' | 'orphanMilestone';

/**
 * One exported plan row: a scheduled training step, or a plan entry the
 * schedule leaves out (already trained, in training or ahead of the plan in the
 * live queue, unknown to this SDE snapshot, or left unscheduled by a plan
 * error), so the file lists every entry the plan holds, in plan position.
 * A Plan Milestone with no row to sit on is a row of its own.
 */
export interface QueueCsvRow {
  status: QueueEntryStatus;
  skillTypeID: number;
  level: number;
  /** Present for `scheduled` only. */
  step?: ScheduledStep;
  /** The step's index in the schedule, for the marker, Booster and Alpha lookups. */
  stepIndex?: number;
  /** The level in training in the live queue: its real time left, and the instant that ends. */
  remainingSeconds?: number;
  doneByMs?: number;
  /** Names of the Plan Milestones anchored at this skill level. */
  milestone?: string;
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
 * The plan in plan position: each entry's scheduled steps (its prerequisites
 * first), then a status row when the entry has no step of its own.
 */
export function queueCsvRows({
  schedule,
  entries,
  trainedSkills,
  pinned,
  nowMs,
  milestones,
}: {
  schedule: Pick<SkillPlanSchedule, 'scheduled' | 'isKnownSkill' | 'entryBoundaries' | 'error'>;
  entries: readonly PlanEntry[];
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
    step: scheduled[stepIndex],
    stepIndex,
  });
  const scheduledLevels = new Set(scheduled.map((s) => `${s.skillTypeID}:${s.level}`));
  // A rejected plan has no schedule, so no boundaries to read.
  const slices =
    schedule.error === null
      ? entrySlices(entries, schedule.entryBoundaries, scheduled, schedule.isKnownSkill)
      : entries.map(() => ({ start: 0, ownStart: -1, end: 0 }));
  const rows: QueueCsvRow[] = [];
  entries.forEach((entry, i) => {
    for (let stepIndex = slices[i].start; stepIndex < slices[i].end; stepIndex++) {
      rows.push(stepRow(stepIndex));
    }
    if (scheduledLevels.has(`${entry.skillTypeID}:${entry.targetLevel}`)) return;
    const base = { skillTypeID: entry.skillTypeID, level: entry.targetLevel };
    if (!schedule.isKnownSkill(entry.skillTypeID)) {
      rows.push({ ...base, status: 'unknown' });
    } else if ((trainedSkills.get(entry.skillTypeID)?.level ?? 0) >= entry.targetLevel) {
      rows.push({ ...base, status: 'trained' });
    } else if (pinned !== null && pinned.id === entryId(entry)) {
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
  });
  const namesAt = new Map<string, string[]>();
  for (const milestone of milestones) {
    const key = `${milestone.skillTypeID}:${milestone.level}`;
    namesAt.set(key, [...(namesAt.get(key) ?? []), milestone.name]);
  }
  const placed = new Set<string>();
  for (const row of rows) {
    const key = `${row.skillTypeID}:${row.level}`;
    const names = namesAt.get(key);
    if (names) {
      row.milestone = names.join('; ');
      placed.add(key);
    }
  }
  for (const milestone of milestones) {
    const key = `${milestone.skillTypeID}:${milestone.level}`;
    if (placed.has(key)) continue;
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
    { header: t('plans.csvSeconds'), value: (row) => row.step?.seconds ?? row.remainingSeconds },
    { header: t('plans.csvCumulativeSeconds'), value: stepOnly((step) => step.cumulativeSeconds) },
    {
      header: t('plans.csvStart'),
      value: stepOnly((step) =>
        stepFinish(step.cumulativeSeconds - step.seconds, schedule.startDate).toISOString()
      ),
    },
    {
      header: t('plans.csvDoneBy'),
      value: (row) =>
        row.step
          ? stepFinish(row.step.cumulativeSeconds, schedule.startDate).toISOString()
          : row.doneByMs === undefined
            ? undefined
            : new Date(row.doneByMs).toISOString(),
    },
    { header: t('plans.csvMilestone'), value: (row) => row.milestone },
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
